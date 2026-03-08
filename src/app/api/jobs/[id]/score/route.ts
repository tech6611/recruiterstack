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
import { scoreApplicationForJob } from '@/lib/ai/job-scorer'
import type { Candidate, HiringRequest } from '@/lib/types/database'

export const maxDuration = 300 // 5 min — needed for large pipelines on Vercel

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const supabase = createAdminClient()
  const jobId = params.id

  // ── 1. Fetch job, stages, and active applications ──────────────────────────
  const [jobRes, stagesRes, appsRes] = await Promise.all([
    supabase.from('hiring_requests').select('*').eq('id', jobId).single(),
    supabase
      .from('pipeline_stages')
      .select('*')
      .eq('hiring_request_id', jobId)
      .order('order_index'),
    supabase
      .from('applications')
      .select('*, candidate:candidates(*)')
      .eq('hiring_request_id', jobId)
      .eq('status', 'active'),
  ])

  if (jobRes.error || !jobRes.data) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 })
  }

  const job    = jobRes.data as HiringRequest
  const stages = stagesRes.data ?? []
  const apps   = appsRes.data  ?? []

  if (apps.length === 0) {
    return NextResponse.json({ error: 'No active applications to score' }, { status: 400 })
  }

  // ── 2. Stream SSE response ─────────────────────────────────────────────────
  const stream = new ReadableStream({
    async start(controller) {
      const enc  = new TextEncoder()
      const send = (payload: object) =>
        controller.enqueue(enc.encode(`data: ${JSON.stringify(payload)}\n\n`))

      let scored = 0, autoAdvanced = 0, autoRejected = 0, emailsSent = 0

      const advanceStage = job.auto_advance_stage_id
        ? stages.find(s => s.id === job.auto_advance_stage_id)
        : null

      // ── 3. Score each application (sequentially for meaningful progress) ────
      for (const app of apps) {
        const candidate = (app as unknown as { candidate: Candidate }).candidate
        if (!candidate) continue

        try {
          const result = await scoreApplicationForJob(candidate, job)
          scored++

          // Write score back to applications
          await supabase
            .from('applications')
            .update({
              ai_score:          result.score,
              ai_recommendation: result.recommendation,
              ai_strengths:      result.strengths,
              ai_gaps:           result.gaps,
              ai_scored_at:      new Date().toISOString(),
            } as never)
            .eq('id', app.id)

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
              .update({ stage_id: job.auto_advance_stage_id } as never)
              .eq('id', app.id)

            await supabase.from('application_events').insert({
              application_id: app.id,
              event_type:     'stage_moved',
              from_stage:     stages.find(s => s.id === app.stage_id)?.name ?? null,
              to_stage:       advanceStage?.name ?? null,
              note:           `AI Autopilot: score ${result.score} ≥ threshold ${job.auto_advance_score}`,
              created_by:     'AI Autopilot',
            } as never)

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
              .update({ status: 'rejected' } as never)
              .eq('id', app.id)

            await supabase.from('application_events').insert({
              application_id: app.id,
              event_type:     'status_changed',
              to_stage:       'rejected',
              note:           `AI Autopilot: score ${result.score} ≤ threshold ${job.auto_reject_score}`,
              created_by:     'AI Autopilot',
            } as never)

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
                        note:           `Rejection email sent automatically: "${draft.subject}"`,
                        created_by:     'AI Autopilot',
                      } as never)
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
            type:           'progress',
            application_id: app.id,
            candidate_name: candidate.name,
            score:          result.score,
            recommendation: result.recommendation,
            action,
          })

        } catch (err) {
          send({
            type:           'error',
            application_id: app.id,
            candidate_name: candidate.name,
            error:          err instanceof Error ? err.message : 'Scoring failed',
          })
        }
      }

      // ── 4. Complete event ──────────────────────────────────────────────────
      send({
        type:          'complete',
        total:         apps.length,
        scored,
        auto_advanced: autoAdvanced,
        auto_rejected: autoRejected,
        emails_sent:   emailsSent,
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
