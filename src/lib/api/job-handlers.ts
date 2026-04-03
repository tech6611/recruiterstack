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
    })
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
          },
          { onConflict: 'candidate_id,role_id' },
        )
      if (error) throw new Error(error.message)
    }),
  )

  const failed = results.filter((r) => r.status === 'rejected').length
  const succeeded = results.length - failed

  // Auto-decision thresholds
  if (role.auto_advance_threshold || role.auto_reject_threshold) {
    const { data: matches } = await supabase
      .from('matches')
      .select('candidate_id, score')
      .eq('role_id', roleId)

    for (const m of matches ?? []) {
      if (role.auto_advance_threshold && m.score >= role.auto_advance_threshold) {
        await supabase.from('candidates').update({ status: 'interviewing' }).eq('id', m.candidate_id).eq('org_id', job.org_id)
      } else if (role.auto_reject_threshold && m.score <= role.auto_reject_threshold) {
        await supabase.from('candidates').update({ status: 'rejected' }).eq('id', m.candidate_id).eq('org_id', job.org_id)
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

// ── Sequence Email ────────────────────────────────────────────────────────────

registerHandler('sequence_email', async (job: QueuedJob) => {
  const { enrollmentId, sequenceId } = job.payload as { enrollmentId: string; sequenceId: string }
  if (!enrollmentId || !sequenceId) throw new Error('Missing enrollmentId or sequenceId')

  const supabase = createAdminClient()

  // Fetch enrollment — scoped to org
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: enrollment } = await (supabase.from('sequence_enrollments') as any)
    .select('*, candidates(name, email, current_title, location)')
    .eq('id', enrollmentId)
    .eq('org_id', job.org_id)
    .single()

  if (!enrollment) throw new Error('Enrollment not found')
  if (enrollment.status !== 'active') {
    logger.info('Enrollment not active, skipping', { enrollmentId, status: enrollment.status })
    return
  }

  // Fetch sequence stages
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: stages } = await (supabase.from('sequence_stages') as any)
    .select('*')
    .eq('sequence_id', sequenceId)
    .order('order_index', { ascending: true })

  if (!stages || stages.length === 0) throw new Error('No stages in sequence')

  const stageIdx = enrollment.current_stage_index ?? 0
  if (stageIdx >= stages.length) {
    // All stages completed
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from('sequence_enrollments') as any)
      .update({ status: 'completed', completed_at: new Date().toISOString() })
      .eq('id', enrollmentId)
    logger.info('Sequence completed', { enrollmentId })
    return
  }

  const stage = stages[stageIdx]
  const candidate = enrollment.candidates

  if (!candidate?.email) {
    logger.error('Candidate has no email', undefined, { enrollmentId, candidateId: enrollment.candidate_id })
    return
  }

  // Token replacement
  const firstName = candidate.name?.split(' ')[0] ?? ''
  const tokens: Record<string, string> = {
    '{{candidate_first_name}}': firstName,
    '{{candidate_name}}': candidate.name ?? '',
    '{{candidate_title}}': candidate.current_title ?? '',
    '{{candidate_location}}': candidate.location ?? '',
    '{{job_title}}': '', // Would need application context
    '{{company_name}}': '',
    '{{recruiter_name}}': '',
  }

  let subject = stage.subject ?? ''
  let body = stage.body ?? ''
  for (const [token, value] of Object.entries(tokens)) {
    subject = subject.replaceAll(token, value)
    body = body.replaceAll(token, value)
  }

  // Send via SendGrid
  const apiKey = process.env.SENDGRID_API_KEY
  const fromEmail = process.env.SENDGRID_FROM_EMAIL
  if (!apiKey || !fromEmail) {
    logger.warn('SendGrid not configured, skipping sequence email', { enrollmentId })
    return
  }

  const sgMail = (await import('@sendgrid/mail')).default
  sgMail.setApiKey(apiKey)

  const fromName = stage.send_on_behalf_of ?? 'RecruiterStack'

  let sendgridMessageId: string | null = null
  try {
    const [response] = await sgMail.send({
      to: candidate.email,
      from: { email: stage.send_on_behalf_email ?? fromEmail, name: fromName },
      subject,
      html: body,
    })
    sendgridMessageId = response?.headers?.['x-message-id'] ?? null
  } catch (err) {
    // Record failed email and mark enrollment as bounced — don't retry
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from('sequence_emails') as any)
      .insert({
        enrollment_id: enrollmentId,
        stage_id: stage.id,
        candidate_id: enrollment.candidate_id,
        to_email: candidate.email,
        subject,
        body,
        status: 'failed',
        org_id: job.org_id,
      })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from('sequence_enrollments') as any)
      .update({ status: 'bounced', completed_at: new Date().toISOString() })
      .eq('id', enrollmentId)
    logger.error('Sequence email send failed, enrollment marked bounced', err, { enrollmentId })
    return // Don't throw — prevents infinite retry
  }

  // Record sent email
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase.from('sequence_emails') as any)
    .insert({
      enrollment_id: enrollmentId,
      stage_id: stage.id,
      candidate_id: enrollment.candidate_id,
      to_email: candidate.email,
      subject,
      body,
      sendgrid_message_id: sendgridMessageId,
      status: 'sent',
      sent_at: new Date().toISOString(),
      org_id: job.org_id,
    })

  // Calculate next_send_at for the next stage
  const nextStageIdx = stageIdx + 1
  if (nextStageIdx < stages.length) {
    const nextStage = stages[nextStageIdx]
    let delayMs = (nextStage.delay_days ?? 1) * 24 * 60 * 60 * 1000

    // Business days: rough approximation (add 2 days per 5 for weekends)
    if (nextStage.delay_business_days) {
      const weekends = Math.floor((nextStage.delay_days ?? 1) / 5) * 2
      delayMs += weekends * 24 * 60 * 60 * 1000
    }

    const nextSendAt = new Date(Date.now() + delayMs).toISOString()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from('sequence_enrollments') as any)
      .update({ current_stage_index: nextStageIdx, next_send_at: nextSendAt })
      .eq('id', enrollmentId)

    // Enqueue the next email send
    const { enqueue: enqueueJob } = await import('./job-queue')
    await enqueueJob({
      orgId: job.org_id,
      jobType: 'sequence_email',
      payload: { enrollmentId, sequenceId },
      delaySeconds: Math.round(delayMs / 1000),
    })
  } else {
    // Last stage — mark completed
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from('sequence_enrollments') as any)
      .update({ status: 'completed', completed_at: new Date().toISOString(), current_stage_index: nextStageIdx })
      .eq('id', enrollmentId)
  }

  logger.info('Sequence email sent', {
    jobId: job.id, enrollmentId, stageIdx, candidateEmail: candidate.email,
  })
})
