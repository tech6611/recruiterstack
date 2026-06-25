import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { notify } from '@/lib/notifications'
import { runAutopilot } from '@/lib/ai/autopilot'
import { enqueue } from '@/lib/api/job-queue'
import { parseBody, handleSupabaseError } from '@/lib/api/helpers'
import { checkRateLimit } from '@/lib/api/rate-limit'
import { publicApplySchema } from '@/lib/validations/applications'
import { logger } from '@/lib/logger'
import { findOrCreateCandidateProfile } from '@/modules/ats/domain/candidates'
import { createApplication, recordApplicationEvent } from '@/modules/ats/domain/applications'
import {
  getCanonicalApplyJobByToken,
  getCanonicalApplyJobPreview,
  getFirstJobStage,
} from '@/modules/ats/domain/job-pipelines'
import {
  getJobScreeningForm,
  evaluateKnockout,
  partitionAnswers,
  isFieldVisible,
} from '@/modules/ats/domain/screening'
import type { ApplicationEventInsert, ScreeningAnswer } from '@/lib/types/database'

// GET /api/apply?token=xxx — fetch job info for the public apply page
export async function GET(request: NextRequest) {
  const supabase = createAdminClient()
  const token = new URL(request.url).searchParams.get('token')

  if (!token) {
    return NextResponse.json({ error: 'token required' }, { status: 400 })
  }

  const data = await getCanonicalApplyJobPreview(supabase, token)
  if (!data) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  return NextResponse.json({ data })
}

// POST /api/apply
// Public application form submission (no auth required).
export async function POST(request: NextRequest) {
  // Rate limit public endpoint
  const rateLimited = await checkRateLimit(request)
  if (rateLimited) return rateLimited

  const supabase = createAdminClient()

  const body = await parseBody(request, publicApplySchema)
  if (body instanceof NextResponse) return body

  const { token, name, email, phone, linkedin_url, cover_letter, cv_url, screening_answers } = body

  // ── Verify token & get job ────────────────────────────────────────────────
  const job = await getCanonicalApplyJobByToken(supabase, token)
  if (!job) {
    return NextResponse.json({ error: 'Invalid or expired apply link' }, { status: 404 })
  }

  // A canonical job accepts applications only while it is open.
  if (job.status !== 'open') {
    return NextResponse.json({ error: 'This position is no longer accepting applications.' }, { status: 400 })
  }

  // ── Screening answers (Phase 3c) ──────────────────────────────────────────
  // Re-load the job's form server-side (the client only sends field id + value),
  // attach each field's label, enforce required answers, then evaluate the
  // knockout rules and split EEO answers into their hidden bucket.
  const form = await getJobScreeningForm(supabase, job.org_id, job.id)
  const fieldById = new Map(form.fields.map(f => [f.id, f]))
  const answers: ScreeningAnswer[] = []
  for (const submitted of screening_answers ?? []) {
    const field = fieldById.get(submitted.field_id)
    if (!field) continue // ignore answers to fields not on this form
    answers.push({ field_id: field.id, label: field.label, value: submitted.value })
  }

  const answerById = new Map(answers.map(a => [a.field_id, a.value]))
  for (const field of form.fields) {
    if (!field.required) continue
    // A required field hidden by conditional logic isn't really required.
    if (!isFieldVisible(field, answers)) continue
    const v = answerById.get(field.id)
    const empty = v == null || (typeof v === 'string' && v.trim() === '') || (Array.isArray(v) && v.length === 0)
    if (empty) {
      return NextResponse.json({ error: `Please answer: ${field.label}` }, { status: 400 })
    }
  }

  const knockoutFailed = evaluateKnockout(form, answers)
  const { screening: screeningAnswers, eeo: eeoAnswers } = partitionAnswers(form, answers)

  // ── Upsert candidate ──────────────────────────────────────────────────────
  let candidateId: string
  try {
    const candidate = await findOrCreateCandidateProfile(supabase, job.org_id, {
      name,
      email,
      phone: phone ?? null,
      resume_url: cv_url ?? null,
      linkedin_url: linkedin_url ?? null,
    })
    candidateId = candidate.id
  } catch (err) {
    return handleSupabaseError(err as { code: string; message: string })
  }

  // ── Get first pipeline stage ──────────────────────────────────────────────
  const firstStage = await getFirstJobStage(supabase, job.org_id, job.id)

  // ── Create application ────────────────────────────────────────────────────
  let appId: string
  try {
    const app = await createApplication(supabase, {
      orgId: job.org_id,
      candidateId,
      jobId: job.id,
      stageId: firstStage?.id ?? null,
      // A failed knockout auto-rejects silently — the candidate still sees the
      // success screen, but the application lands as rejected for the team.
      status: knockoutFailed ? 'rejected' : 'active',
      source: 'applied',
      resumeUrl: cv_url ?? null,
      coverLetter: cover_letter ?? null,
      screeningAnswers,
      eeoAnswers,
      knockoutFailed,
    })
    appId = app.id
  } catch (err) {
    const appErr = err as { code?: string; message: string }
    if (appErr.code === '23505') {
      return NextResponse.json(
        { error: 'You have already applied for this role.' },
        { status: 409 }
      )
    }
    return handleSupabaseError(appErr as { code: string; message: string })
  }

  // ── Timeline event ────────────────────────────────────────────────────────
  const noteParts: string[] = []
  if (linkedin_url) noteParts.push(`LinkedIn: ${linkedin_url}`)
  if (cv_url) noteParts.push(`CV: ${cv_url}`)
  if (knockoutFailed) noteParts.push('Auto-screened out (disqualifying answer)')

  await recordApplicationEvent(
    supabase,
    {
      application_id: appId,
      event_type: 'applied',
      from_stage: null,
      to_stage: firstStage?.name ?? 'Applied',
      note: noteParts.length ? noteParts.join(' | ') : null,
      metadata: {},
      created_by: name,
      org_id: job.org_id,
    } as unknown as ApplicationEventInsert,
  )

  // ── Notification (in-app + Slack) ─────────────────────────────────────────
  await notify({
    orgId: job.org_id,
    type: 'candidate_applied',
    title: `New application: ${name}`,
    body: `${name} applied for ${job.title}`,
    slackText: `📥 New application: *${name}* applied for *${job.title}*`,
    resourceType: 'application',
    resourceId: appId,
  })

  // ── Autopilot: enqueue scoring ─────────────────────────────────────────────
  // Canonical jobs carry no auto-advance/reject thresholds (those are a legacy
  // hiring_requests concern), so enqueue unconditionally; the scorer no-ops when
  // no scoring config applies. Skip entirely for knocked-out applications —
  // they're already rejected, so there's nothing to score.
  if (!knockoutFailed) {
    try {
      await enqueue({
        orgId: job.org_id,
        jobType: 'autopilot',
        payload: { applicationId: appId },
      })
    } catch {
      // Queue unavailable — fall back to original fire-and-forget
      logger.warn('Queue unavailable, falling back to direct autopilot', { applicationId: appId })
      void runAutopilot(appId, job.org_id).catch((err) => {
        logger.error('Autopilot failed', err, { applicationId: appId })
      })
    }
  }

  return NextResponse.json(
    {
      data: {
        application_id: appId,
        job_title: job.title,
        message: 'Application submitted successfully.',
      },
    },
    { status: 201 }
  )
}
