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
  activateLegacyApplyJob,
  getFirstLegacyPipelineStage,
  getLegacyApplyJobByToken,
  getLegacyApplyJobPreview,
} from '@/modules/ats/domain/job-pipelines'
import type { ApplicationEventInsert } from '@/lib/types/database'

// GET /api/apply?token=xxx — fetch job info for the public apply page
export async function GET(request: NextRequest) {
  const supabase = createAdminClient()
  const token = new URL(request.url).searchParams.get('token')

  if (!token) {
    return NextResponse.json({ error: 'token required' }, { status: 400 })
  }

  const data = await getLegacyApplyJobPreview(supabase, token)
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

  const { token, name, email, phone, linkedin_url, cover_letter, cv_url } = body

  // ── Verify token & get job ────────────────────────────────────────────────
  const job = await getLegacyApplyJobByToken(supabase, token)
  if (!job) {
    return NextResponse.json({ error: 'Invalid or expired apply link' }, { status: 404 })
  }

  // Only accept applications for posted or active jobs
  if (job.status !== 'posted' && job.status !== 'active') {
    return NextResponse.json({ error: 'This position is no longer accepting applications.' }, { status: 400 })
  }

  // Auto-transition posted → active on first application
  if (job.status === 'posted') {
    await activateLegacyApplyJob(supabase, job.org_id, job.id)
  }

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
  const firstStage = await getFirstLegacyPipelineStage(supabase, job.org_id, job.id)

  // ── Create application ────────────────────────────────────────────────────
  let appId: string
  try {
    const app = await createApplication(supabase, {
      orgId: job.org_id,
      candidateId,
      hiringRequestId: job.id,
      stageId: firstStage?.id ?? null,
      source: 'applied',
      resumeUrl: cv_url ?? null,
      coverLetter: cover_letter ?? null,
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
    body: `${name} applied for ${job.position_title}`,
    slackText: `📥 New application: *${name}* applied for *${job.position_title}*`,
    resourceType: 'application',
    resourceId: appId,
  })

  // ── Autopilot: enqueue scoring if thresholds are configured ────────────────
  const hasAutopilot =
    job.auto_advance_score !== null ||
    job.auto_reject_score  !== null

  if (hasAutopilot) {
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
        job_title: job.position_title,
        message: 'Application submitted successfully.',
      },
    },
    { status: 201 }
  )
}
