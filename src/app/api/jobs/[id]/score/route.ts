/**
 * POST /api/jobs/[id]/score
 *
 * Bulk AI-scores all active applications for a job.
 * Streams progress via Server-Sent Events so the UI shows a live counter.
 *
 * SSE events:
 *   { type: 'progress', application_id, candidate_name, score, recommendation, action }
 *   { type: 'error',    application_id, candidate_name, error }
 *   { type: 'complete', total, scored, auto_advanced, auto_rejected, emails_sent }
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireOrg } from '@/lib/auth'
import { scoreApplicationForJob } from '@/lib/ai/job-scorer'
import { createNotification } from '@/lib/api/notify'
import type { Candidate, HiringRequest, PipelineStage, Application, ApplicationUpdate, ApplicationEventInsert } from '@/lib/types/database'

export const maxDuration = 300 // 5 min — needed for large pipelines on Vercel

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const authResult = await requireOrg()
  if (authResult instanceof NextResponse) return authResult
  const { orgId } = authResult

  const supabase = createAdminClient()
  const jobId = params.id

  // Optional filters from request body
  let stageId: string | null = null
  let applicationId: string | null = null
  let scoringCriteriaOverride: unknown[] | null = null
  try {
    const body = await req.json()
    stageId                 = body?.stage_id        ?? null
    applicationId           = body?.application_id  ?? null
    scoringCriteriaOverride = Array.isArray(body?.scoring_criteria) ? body.scoring_criteria : null
  } catch { /* no body — score all */ }

  // ── 1. Fetch job, stages, and active applications ──────────────────────────
  const [jobRes, stagesRes, appsRes] = await Promise.all([
    supabase.from('hiring_requests').select('*').eq('id', jobId).eq('org_id', orgId).single(),
    supabase
      .from('pipeline_stages')
      .select('*')
      .eq('hiring_request_id', jobId)
      .eq('org_id', orgId)
      .order('order_index'),
    supabase
      .from('applications')
      .select('*, candidate:candidates(*)')
      .eq('hiring_request_id', jobId)
      .eq('org_id', orgId)
      .eq('status', 'active'),
  ])

  if (jobRes.error || !(jobRes as { data: unknown }).data) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 })
  }

  const job    = (jobRes as { data: unknown }).data as HiringRequest
  const stages = (stagesRes.data ?? []) as PipelineStage[]
  const allApps = (appsRes.data ?? []) as (Application & { candidate: Candidate })[]

  // Filter by application_id or stage_id if requested
  let apps = allApps
  if (applicationId) apps = allApps.filter(a => a.id === applicationId)
  else if (stageId)  apps = allApps.filter(a => a.stage_id === stageId)

  if (apps.length === 0) {
    return NextResponse.json({ error: 'No active applications to score' }, { status: 400 })
  }

  // Skip already-scored apps unless a specific applicationId was given (manual re-score)
  // This prevents duplicate Claude API calls when "Score this stage" is clicked again
  if (!applicationId) {
    apps = apps.filter(a => !a.ai_scored_at)
    if (apps.length === 0) {
      return NextResponse.json({ error: 'All applications in this selection have already been scored' }, { status: 400 })
    }
  }

  // ── 2. Stream SSE response ─────────────────────────────────────────────────
  const stream = new ReadableStream({
    async start(controller) {
      const enc  = new TextEncoder()
      const send = (payload: object) =>
        controller.enqueue(enc.encode(`data: ${JSON.stringify(payload)}\n\n`))

      let scored = 0, autoAdvanced = 0, autoRejected = 0, emailsSent = 0, errors = 0
      let firstError = ''

      const advanceStage = job.auto_advance_stage_id
        ? stages.find(s => s.id === job.auto_advance_stage_id)
        : null

      // ── 3. Score each application (sequentially for meaningful progress) ────
      for (const app of apps) {
        const candidate = app.candidate
        if (!candidate) continue

        try {
          // Allow caller to inject scoring_criteria (e.g. from the UI's localCriteria)
          // when the DB job row may not have them yet (newly added or not saved)
          const jobForScoring = scoringCriteriaOverride
            ? { ...job, scoring_criteria: scoringCriteriaOverride } as HiringRequest
            : job
          const result = await scoreApplicationForJob(candidate, jobForScoring)

          // Write core score fields — always required
          const { error: updateErr } = await supabase
            .from('applications')
            .update({
              ai_score:          result.score,
              ai_recommendation: result.recommendation,
              ai_strengths:      result.strengths,
              ai_gaps:           result.gaps,
              ai_scored_at:      new Date().toISOString(),
            } as unknown as ApplicationUpdate)
            .eq('id', app.id)

          if (updateErr) throw new Error(`DB write failed: ${updateErr.message}`)

          // Write per-criterion scores separately — non-fatal if column missing
          if (result.criterion_scores && result.criterion_scores.length > 0) {
            await supabase
              .from('applications')
              .update({ ai_criterion_scores: result.criterion_scores } as unknown as ApplicationUpdate)
              .eq('id', app.id)
            // ignore error: column may not exist yet (migration 018 pending)
          }

          scored++ // only count if DB write succeeded

          // ── Auto-advance ───────────────────────────────────────────────────
          let action: 'advanced' | 'rejected' | 'none' = 'none'

          const shouldAdvance =
            job.auto_advance_score !== null &&
            job.auto_advance_score !== undefined &&
            job.auto_advance_stage_id &&
            result.score >= (job.auto_advance_score as number) &&
            app.stage_id !== job.auto_advance_stage_id

          if (shouldAdvance) {
            await supabase
              .from('applications')
              .update({ stage_id: job.auto_advance_stage_id } as unknown as ApplicationUpdate)
              .eq('id', app.id)

            await supabase.from('application_events').insert({
              application_id: app.id,
              event_type:     'stage_moved',
              from_stage:     stages.find(s => s.id === app.stage_id)?.name ?? null,
              to_stage:       advanceStage?.name ?? null,
              note:           `AI Autopilot: score ${result.score} ≥ threshold ${job.auto_advance_score}`,
              metadata:       {},
              created_by:     'AI Autopilot',
            } as unknown as ApplicationEventInsert)

            autoAdvanced++
            action = 'advanced'
          }

          // ── Auto-reject (only if not already advanced) ─────────────────────
          const shouldReject =
            !shouldAdvance &&
            job.auto_reject_score !== null &&
            job.auto_reject_score !== undefined &&
            result.score <= (job.auto_reject_score as number)

          if (shouldReject) {
            await supabase
              .from('applications')
              .update({ status: 'rejected' } as unknown as ApplicationUpdate)
              .eq('id', app.id)

            await supabase.from('application_events').insert({
              application_id: app.id,
              event_type:     'status_changed',
              from_stage:     null,
              to_stage:       'rejected',
              note:           `AI Autopilot: score ${result.score} ≤ threshold ${job.auto_reject_score}`,
              metadata:       {},
              created_by:     'AI Autopilot',
            } as unknown as ApplicationEventInsert)

            autoRejected++
            action = 'rejected'

            // Auto-email rejection (if enabled and candidate has email)
            if (job.auto_email_rejection && candidate.email) {
              try {
                const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

                const draftRes = await fetch(`${appUrl}/api/applications/${app.id}/email-draft`, {
                  method:  'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body:    JSON.stringify({
                    template:       'rejection',
                    recruiter_name: job.autopilot_recruiter_name ?? 'The Recruiting Team',
                    company_name:   job.autopilot_company_name   ?? 'our company',
                  }),
                })

                if (draftRes.ok) {
                  const { data: draft } = await draftRes.json()
                  if (draft?.subject && draft?.body) {
                    const sendRes = await fetch(`${appUrl}/api/email/send`, {
                      method:  'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body:    JSON.stringify({
                        to:      candidate.email,
                        subject: draft.subject,
                        body:    draft.body,
                        from_name: job.autopilot_recruiter_name
                          ? `${job.autopilot_recruiter_name}${job.autopilot_company_name ? ` · ${job.autopilot_company_name}` : ''}`
                          : 'RecruiterStack',
                      }),
                    })
                    if (sendRes.ok) {
                      emailsSent++
                      // Log email sent event
                      await supabase.from('application_events').insert({
                        application_id: app.id,
                        event_type:     'email_sent',
                        from_stage:     null,
                        to_stage:       null,
                        note:           `Rejection email sent automatically: "${draft.subject}"`,
                        metadata:       {},
                        created_by:     'AI Autopilot',
                      } as unknown as ApplicationEventInsert)
                    }
                  }
                }
              } catch {
                // Email failure is non-fatal — don't stop the scoring run
              }
            }
          }

          // ── Send progress event ────────────────────────────────────────────
          send({
            type:             'progress',
            application_id:   app.id,
            candidate_name:   candidate.name,
            score:            result.score,
            recommendation:   result.recommendation,
            strengths:        result.strengths,
            gaps:             result.gaps,
            criterion_scores: result.criterion_scores ?? null,
            action,
          })

        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Scoring failed'
          errors++
          if (!firstError) firstError = msg
          send({
            type:           'error',
            application_id: app.id,
            candidate_name: candidate.name,
            error:          msg,
          })
        }
      }

      // ── 4. Complete event ──────────────────────────────────────────────────
      send({
        type:          'complete',
        total:         apps.length,
        scored,
        errors,
        first_error:   firstError || null,
        auto_advanced: autoAdvanced,
        auto_rejected: autoRejected,
        emails_sent:   emailsSent,
      })

      // In-app notification for scoring completion
      await createNotification({
        orgId,
        type: 'score_complete',
        title: `Scoring complete: ${job.position_title}`,
        body: `${scored} candidate${scored !== 1 ? 's' : ''} scored${autoAdvanced ? `, ${autoAdvanced} advanced` : ''}${autoRejected ? `, ${autoRejected} rejected` : ''}`,
        resourceType: 'job',
        resourceId: jobId,
      })

      controller.close()
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type':  'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection':    'keep-alive',
    },
  })
}
