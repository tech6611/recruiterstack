/**
 * Job handler registry — maps job types to their implementations.
 *
 * Import this file once (in the queue worker endpoint) to register all handlers.
 */

import { registerHandler, enqueue, type QueuedJob } from './job-queue'
import { computeStageDelaySeconds } from '@/lib/sequences/schedule'
import { handleSlaCheck } from '@/lib/approvals/sla-handler'
import { handleWebhookDelivery } from '@/lib/webhooks/delivery'
import { runAutopilot } from '@/lib/ai/autopilot'
import { matchCandidateToRole } from '@/lib/ai/matcher'
import { createAdminClient } from '@/lib/supabase/server'
import { logger } from '@/lib/logger'
import { generateText } from '@/lib/ai/llm'
import sgMail from '@sendgrid/mail'
import type { Candidate, Role } from '@/lib/types/database'
import {
  getCandidateForSummary,
  saveCandidateAiSummary,
  setCandidateStatus,
} from '@/modules/ats/domain/candidates'
import {
  listApplicationsForCandidateSummary,
} from '@/modules/ats/domain/applications'
import { getRoleMatchingInputs } from '@/modules/ats/domain/role-profiles'
import { getApplicationJobTokens } from '@/modules/ats/domain/job-pipelines'

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

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error('GEMINI_API_KEY not configured')

  const supabase = createAdminClient()

  // Fetch candidate + applications + events + scorecards
  const [candidate, appsRes] = await Promise.all([
    getCandidateForSummary(supabase, job.org_id, candidateId),
    listApplicationsForCandidateSummary(supabase, job.org_id, candidateId),
  ])

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

  const { text } = await generateText(prompt, {
    model: 'claude-haiku-4-5-20251001',
    maxTokens: 800,
  })

  const summary = text.trim()

  await saveCandidateAiSummary(supabase, job.org_id, candidateId, summary)

  logger.info('AI summary generated via queue', { jobId: job.id, candidateId })
})

// ── Matching ──────────────────────────────────────────────────────────────────

registerHandler('matching', async (job: QueuedJob) => {
  const { roleId } = job.payload as { roleId: string }
  if (!roleId) throw new Error('Missing roleId in payload')

  const supabase = createAdminClient()

  const inputs = await getRoleMatchingInputs(supabase, job.org_id, roleId)
  if (!inputs) throw new Error('Role not found')

  const role = inputs.role as Role
  const candidates = inputs.candidates as Candidate[]

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
        await setCandidateStatus(supabase, job.org_id, m.candidate_id, 'interviewing')
      } else if (role.auto_reject_threshold && m.score <= role.auto_reject_threshold) {
        await setCandidateStatus(supabase, job.org_id, m.candidate_id, 'rejected')
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
  const { enrollmentId, sequenceId } = job.payload as {
    enrollmentId: string; sequenceId: string
  }
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

  // Read the LIVE stage list plus which stages this enrollment has already been
  // sent, then pick the next UNSENT stage. This is what makes stage adds/deletes
  // take effect for people still in flight — there is no enroll-time snapshot.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: liveStages } = await (supabase.from('sequence_stages') as any)
    .select('*').eq('sequence_id', sequenceId).order('order_index', { ascending: true })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: sentRows } = await (supabase.from('sequence_emails') as any)
    .select('stage_id').eq('enrollment_id', enrollmentId).eq('status', 'sent')

  const sentStageIds = new Set((sentRows ?? []).map((r: { stage_id: string }) => r.stage_id))
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ordered = (liveStages ?? []) as any[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const nextUnsent = () => ordered.find((s: any) => !sentStageIds.has(s.id))
  const stage = nextUnsent()

  if (!stage) {
    // No unsent stage remains — the enrollment has reached the end of the
    // sequence as it currently stands. Mark it completed.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from('sequence_enrollments') as any)
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        current_stage_index: sentStageIds.size,
      })
      .eq('id', enrollmentId)
    logger.info('Sequence completed — no unsent stages remain', { enrollmentId, sequenceId })
    return
  }

  // Idempotency: skip if a 'sent' email already exists for this enrollment + stage
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { count: alreadySent } = await (supabase.from('sequence_emails') as any)
    .select('id', { count: 'exact', head: true })
    .eq('enrollment_id', enrollmentId)
    .eq('stage_id', stage.id)
    .eq('status', 'sent')
  if (alreadySent && alreadySent > 0) {
    logger.info('Email already sent for this stage, skipping', { enrollmentId, stageId: stage.id })
    return
  }

  const candidate = enrollment.candidates
  if (!candidate?.email) {
    logger.error('Candidate has no email', undefined, { enrollmentId })
    return
  }

  // Fetch hiring request data for token population
  let jobTitle = ''
  let companyName = ''
  let recruiterName = ''
  if (enrollment.application_id) {
    const hr = await getApplicationJobTokens(supabase, enrollment.application_id)
    if (hr) {
      jobTitle = hr.position_title ?? ''
      companyName = hr.autopilot_company_name ?? ''
      recruiterName = hr.autopilot_recruiter_name ?? ''
    }
  }

  // Token replacement
  const firstName = candidate.name?.split(' ')[0] ?? ''
  const tokens: Record<string, string> = {
    '{{candidate_first_name}}': firstName,
    '{{candidate_name}}': candidate.name ?? '',
    '{{candidate_title}}': candidate.current_title ?? '',
    '{{candidate_location}}': candidate.location ?? '',
    '{{job_title}}': jobTitle,
    '{{company_name}}': companyName,
    '{{recruiter_name}}': recruiterName,
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
    logger.warn('SendGrid not configured, skipping', { enrollmentId })
    return
  }

  sgMail.setApiKey(apiKey)

  // Reply-To carries a per-enrollment token so an inbound reply (caught by
  // SendGrid Inbound Parse on the reply subdomain) maps deterministically back
  // to THIS enrollment, letting the inbound webhook mark it 'replied' and
  // auto-stop the remaining stages. See recruiterstack-api sequences/views_webhooks.py.
  const replyDomain = process.env.SEQUENCE_REPLY_DOMAIN || 'reply.recruiterstack.in'
  const replyTo = `reply+${enrollmentId}@${replyDomain}`

  let sendgridMessageId: string | null = null
  try {
    const [response] = await sgMail.send({
      to: candidate.email,
      from: { email: stage.send_on_behalf_email || fromEmail, name: stage.send_on_behalf_of || 'RecruiterStack' },
      replyTo,
      subject,
      html: body,
    })
    sendgridMessageId = response?.headers?.['x-message-id'] ?? null
  } catch (err) {
    // Log the failure — do NOT mark enrollment as bounced so the job queue can retry
    logger.error('Sequence email send failed (will retry via job queue)', err, {
      enrollmentId, stageId: stage.id,
    })
    // Re-throw so processJobs() marks the job as failed and retries with exponential backoff
    throw err
  }

  // Record sent email
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase.from('sequence_emails') as any)
    .insert({
      enrollment_id: enrollmentId, stage_id: stage.id, candidate_id: enrollment.candidate_id,
      to_email: candidate.email, subject, body, sendgrid_message_id: sendgridMessageId,
      status: 'sent', sent_at: new Date().toISOString(), org_id: job.org_id,
    })

  // Advance the display cursor (number of stages sent so far).
  const sentCount = sentStageIds.size + 1
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase.from('sequence_enrollments') as any)
    .update({ current_stage_index: sentCount })
    .eq('id', enrollmentId)

  // Schedule the FOLLOWING stage dynamically from the live list: mark this stage
  // as now-sent, then look for the next unsent stage. If one exists, enqueue it
  // with its own delay (relative to now). If not, the enrollment is complete.
  sentStageIds.add(stage.id)
  const followingStage = nextUnsent()

  if (followingStage) {
    try {
      await enqueue({
        orgId: job.org_id,
        jobType: 'sequence_email',
        payload: { enrollmentId, sequenceId },
        delaySeconds: computeStageDelaySeconds(followingStage, new Date(), false),
      })
    } catch (err) {
      logger.error('Failed to schedule next sequence stage', err, { enrollmentId, sequenceId })
    }
  } else {
    // That was the last stage in the sequence as it currently stands — complete.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from('sequence_enrollments') as any)
      .update({ status: 'completed', completed_at: new Date().toISOString() })
      .eq('id', enrollmentId)
  }

  logger.info('Sequence email sent', {
    jobId: job.id, enrollmentId, stageId: stage.id, candidateEmail: candidate.email,
  })
})

// ── Approval SLA breach check ─────────────────────────────────────────────────
// Enqueued at step activation with scheduled_at = due_at. Worker fires at the
// SLA deadline; sla-handler re-checks the step and sends escalations if still
// pending. Enqueue is exported for use in the engine.
registerHandler('approval_sla_check', handleSlaCheck)
registerHandler('webhook_delivery',   handleWebhookDelivery)

// ── WhatsApp inbound (AI responder) ───────────────────────────────────────────
registerHandler('whatsapp_inbound', async (job: QueuedJob) => {
  const { handleWhatsAppInbound } = await import('@/lib/whatsapp/responder')
  await handleWhatsAppInbound(job)
})
export { enqueue as enqueueJob }
