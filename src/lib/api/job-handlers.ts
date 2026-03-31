/**
 * Job handler registry — maps job types to their implementations.
 *
 * Import this file once (in the queue worker endpoint) to register all handlers.
 */

import { registerHandler, type QueuedJob } from './job-queue'
import { runAutopilot } from '@/lib/ai/autopilot'
import { matchCandidateToRole } from '@/lib/ai/matcher'
import { createAdminClient } from '@/lib/supabase/server'
import { logger } from '@/lib/logger'
import Anthropic from '@anthropic-ai/sdk'
import type { Candidate, Role } from '@/lib/types/database'

// ── Autopilot ─────────────────────────────────────────────────────────────────

registerHandler('autopilot', async (job: QueuedJob) => {
  const { applicationId } = job.payload as { applicationId: string }
  if (!applicationId) throw new Error('Missing applicationId in payload')

  const result = await runAutopilot(applicationId, job.org_id)

  if (result.error) {
    throw new Error(`Autopilot error: ${result.error}`)
  }

  logger.info('Autopilot job done', {
    jobId: job.id,
    applicationId,
    score: result.score,
    action: result.action,
    emailSent: result.emailSent,
  })
})

// ── AI Summary ────────────────────────────────────────────────────────────────

registerHandler('ai_summary', async (job: QueuedJob) => {
  const { candidateId } = job.payload as { candidateId: string }
  if (!candidateId) throw new Error('Missing candidateId in payload')

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured')

  const supabase = createAdminClient()

  // Fetch candidate + applications + events + scorecards
  const [candRes, appsRes] = await Promise.all([
    supabase
      .from('candidates')
      .select('*')
      .eq('id', candidateId)
      .eq('org_id', job.org_id)
      .single(),
    supabase
      .from('applications')
      .select(`
        id, status, source, applied_at, ai_score, ai_recommendation,
        ai_strengths, ai_gaps,
        pipeline_stages(name),
        hiring_requests(position_title, department, level)
      `)
      .eq('candidate_id', candidateId)
      .eq('org_id', job.org_id)
      .order('applied_at', { ascending: false }),
  ])

  if (candRes.error || !candRes.data) {
    throw new Error('Candidate not found')
  }

  const candidate = candRes.data
  const apps = appsRes.data ?? []

  const appIds = apps.map((a: { id: string }) => a.id)
  const [eventsRes, scorecardsRes] = await Promise.all([
    appIds.length
      ? supabase
          .from('application_events')
          .select('event_type, note, created_by, created_at, from_stage, to_stage')
          .in('application_id', appIds)
          .order('created_at', { ascending: true })
      : Promise.resolve({ data: [] }),
    appIds.length
      ? supabase
          .from('scorecards')
          .select('interviewer_name, stage_name, recommendation, scores, overall_notes, created_at')
          .in('application_id', appIds)
          .order('created_at', { ascending: false })
      : Promise.resolve({ data: [] }),
  ])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const appSummaries = apps.map((a: any) => {
    const stage = a.pipeline_stages?.name ?? 'Unknown'
    const jb = a.hiring_requests
    return `- ${jb?.position_title ?? 'Unknown role'}${jb?.department ? ` (${jb.department})` : ''}: ${a.status} / stage: ${stage}${a.ai_score !== null ? ` / AI score: ${a.ai_score}/100` : ''}`
  }).join('\n')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const eventLog = (eventsRes.data ?? []).map((e: any) => {
    const parts = [e.event_type]
    if (e.from_stage && e.to_stage) parts.push(`${e.from_stage} → ${e.to_stage}`)
    else if (e.to_stage) parts.push(e.to_stage)
    if (e.note) parts.push(`"${e.note}"`)
    return `  [${e.created_at?.slice(0, 10)}] ${parts.join(' | ')}`
  }).join('\n')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const scorecardLog = (scorecardsRes.data ?? []).map((s: any) =>
    `  ${s.interviewer_name} (${s.stage_name ?? 'unknown stage'}): ${s.recommendation}${s.overall_notes ? ` — "${s.overall_notes}"` : ''}`
  ).join('\n')

  const prompt = `You are an expert recruiter AI. Summarise the following candidate profile in 3-4 concise paragraphs for a hiring team.

**Candidate**
Name: ${candidate.name}
Title: ${candidate.current_title ?? 'Unknown'}
Location: ${candidate.location ?? 'Not specified'}
Experience: ${candidate.experience_years ?? '?'} years
Skills: ${(candidate.skills ?? []).join(', ') || 'Not listed'}

**Applications**
${appSummaries || 'No applications yet'}

**Activity Timeline**
${eventLog || 'No activity recorded'}

**Interview Scorecards**
${scorecardLog || 'No scorecards yet'}

Write a professional, factual summary covering:
1. Who the candidate is (background, seniority, skills)
2. Their pipeline status across jobs
3. Interview feedback highlights (if any)
4. Overall hiring recommendation with brief rationale

Be concise, direct, and useful for a recruiter who hasn't reviewed this profile before. Do not fabricate details not in the data.`

  const client = new Anthropic({ apiKey })
  const message = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 800,
    messages: [{ role: 'user', content: prompt }],
  })

  const summary = message.content[0].type === 'text' ? message.content[0].text.trim() : ''

  const { error: updateErr } = await supabase
    .from('candidates')
    .update({
      ai_summary: summary,
      ai_summary_generated_at: new Date().toISOString(),
    } as never)
    .eq('id', candidateId)
    .eq('org_id', job.org_id)

  if (updateErr) throw new Error(`Failed to save summary: ${updateErr.message}`)

  logger.info('AI summary generated via queue', { jobId: job.id, candidateId })
})

// ── Matching ──────────────────────────────────────────────────────────────────

registerHandler('matching', async (job: QueuedJob) => {
  const { roleId } = job.payload as { roleId: string }
  if (!roleId) throw new Error('Missing roleId in payload')

  const supabase = createAdminClient()

  const [roleRes, candsRes] = await Promise.all([
    supabase.from('roles').select('*').eq('id', roleId).eq('org_id', job.org_id).single(),
    supabase.from('candidates').select('*').eq('org_id', job.org_id),
  ])

  if (roleRes.error || !roleRes.data) throw new Error('Role not found')
  if (candsRes.error) throw new Error(`Candidates query failed: ${candsRes.error.message}`)

  const role = roleRes.data as Role
  const candidates = (candsRes.data ?? []) as Candidate[]

  const results = await Promise.allSettled(
    candidates.map(async (candidate) => {
      const match = await matchCandidateToRole(candidate, role)
      const { error } = await supabase
        .from('matches')
        .upsert(
          {
            candidate_id: candidate.id,
            role_id: roleId,
            score: match.score,
            strengths: match.strengths,
            gaps: match.gaps,
            reasoning: match.reasoning,
            recommendation: match.recommendation,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          } as any,
          { onConflict: 'candidate_id,role_id' },
        )
      if (error) throw new Error(error.message)
    }),
  )

  const failed = results.filter((r) => r.status === 'rejected').length
  const succeeded = results.length - failed

  // Auto-decision thresholds
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const r = role as any
  if (r.auto_advance_threshold || r.auto_reject_threshold) {
    const { data: matches } = await supabase
      .from('matches')
      .select('candidate_id, score')
      .eq('role_id', roleId)

    for (const m of matches ?? []) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const match = m as any
      if (r.auto_advance_threshold && match.score >= r.auto_advance_threshold) {
        await supabase.from('candidates').update({ status: 'interviewing' }).eq('id', match.candidate_id).eq('org_id', job.org_id)
      } else if (r.auto_reject_threshold && match.score <= r.auto_reject_threshold) {
        await supabase.from('candidates').update({ status: 'rejected' }).eq('id', match.candidate_id).eq('org_id', job.org_id)
      }
    }
  }

  logger.info('Matching job complete via queue', {
    jobId: job.id,
    roleId,
    matched: succeeded,
    failed,
  })
})

// ── Slack Notify ──────────────────────────────────────────────────────────────

registerHandler('slack_notify', async (job: QueuedJob) => {
  const { message, dmEmail } = job.payload as { message: string; dmEmail?: string }
  if (!message) throw new Error('Missing message in payload')

  // Lazy import to avoid circular deps
  const { notifySlack, notifySlackDM } = await import('@/lib/notifications')

  await notifySlack(job.org_id, message)

  if (dmEmail) {
    await notifySlackDM(job.org_id, dmEmail, message)
  }

  logger.info('Slack notification sent via queue', { jobId: job.id })
})
