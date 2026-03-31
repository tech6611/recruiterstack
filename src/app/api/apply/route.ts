import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { notify } from '@/lib/notifications'
import { runAutopilot } from '@/lib/ai/autopilot'
import { enqueue } from '@/lib/api/job-queue'
import { parseBody, handleSupabaseError } from '@/lib/api/helpers'
import { checkRateLimit } from '@/lib/api/rate-limit'
import { publicApplySchema } from '@/lib/validations/applications'
import { logger } from '@/lib/logger'

// GET /api/apply?token=xxx — fetch job info for the public apply page
export async function GET(request: NextRequest) {
  const supabase = createAdminClient()
  const token = new URL(request.url).searchParams.get('token')

  if (!token) {
    return NextResponse.json({ error: 'token required' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('hiring_requests')
    .select('position_title, department, location, generated_jd, status')
    .eq('apply_link_token', token)
    .single()

  if (error || !data) {
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
  const { data: job, error: jobErr } = await supabase
    .from('hiring_requests')
    .select('id, org_id, position_title, status, auto_advance_score, auto_reject_score')
    .eq('apply_link_token', token)
    .single()

  if (jobErr || !job) {
    return NextResponse.json({ error: 'Invalid or expired apply link' }, { status: 404 })
  }

  // ── Upsert candidate ──────────────────────────────────────────────────────
  const { data: existingCandidate } = await supabase
    .from('candidates')
    .select('id')
    .eq('email', email)
    .single()

  let candidateId: string

  if (existingCandidate) {
    candidateId = existingCandidate.id
  } else {
    const { data: newCandidate, error: createErr } = await supabase
      .from('candidates')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .insert({
        name,
        email,
        phone: phone ?? null,
        resume_url: cv_url ?? null,
        skills: [],
        experience_years: 0,
        status: 'active',
      } as any)
      .select('id')
      .single()

    if (createErr) return handleSupabaseError(createErr)
    candidateId = newCandidate!.id
  }

  // ── Get first pipeline stage ──────────────────────────────────────────────
  const { data: firstStage } = await supabase
    .from('pipeline_stages')
    .select('id, name')
    .eq('hiring_request_id', job.id)
    .order('order_index')
    .limit(1)
    .single()

  // ── Create application ────────────────────────────────────────────────────
  const { data: app, error: appErr } = await supabase
    .from('applications')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .insert({
      candidate_id: candidateId,
      hiring_request_id: job.id,
      stage_id: firstStage?.id ?? null,
      status: 'active',
      source: 'applied',
      cover_letter: cover_letter ?? null,
    } as any)
    .select('id')
    .single()

  if (appErr) {
    if (appErr.code === '23505') {
      return NextResponse.json(
        { error: 'You have already applied for this role.' },
        { status: 409 }
      )
    }
    return handleSupabaseError(appErr)
  }

  // ── Timeline event ────────────────────────────────────────────────────────
  const noteParts: string[] = []
  if (linkedin_url) noteParts.push(`LinkedIn: ${linkedin_url}`)
  if (cv_url) noteParts.push(`CV: ${cv_url}`)

  await supabase
    .from('application_events')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .insert({
      application_id: app!.id,
      event_type: 'applied',
      to_stage: firstStage?.name ?? 'Applied',
      note: noteParts.length ? noteParts.join(' | ') : null,
      created_by: name,
    } as any)

  // ── Notification (in-app + Slack) ─────────────────────────────────────────
  await notify({
    orgId: job.org_id,
    type: 'candidate_applied',
    title: `New application: ${name}`,
    body: `${name} applied for ${job.position_title}`,
    slackText: `📥 New application: *${name}* applied for *${job.position_title}*`,
    resourceType: 'application',
    resourceId: app!.id,
  })

  // ── Autopilot: enqueue scoring if thresholds are configured ────────────────
  const hasAutopilot =
    (job as { auto_advance_score: number | null; auto_reject_score: number | null })
      .auto_advance_score !== null ||
    (job as { auto_advance_score: number | null; auto_reject_score: number | null })
      .auto_reject_score  !== null

  if (hasAutopilot) {
    try {
      await enqueue({
        orgId: job.org_id,
        jobType: 'autopilot',
        payload: { applicationId: app!.id },
      })
    } catch {
      // Queue unavailable — fall back to original fire-and-forget
      logger.warn('Queue unavailable, falling back to direct autopilot', { applicationId: app!.id })
      void runAutopilot(app!.id, job.org_id).catch((err) => {
        logger.error('Autopilot failed', err, { applicationId: app!.id })
      })
    }
  }

  return NextResponse.json(
    {
      data: {
        application_id: app!.id,
        job_title: job.position_title,
        message: 'Application submitted successfully.',
      },
    },
    { status: 201 }
  )
}
