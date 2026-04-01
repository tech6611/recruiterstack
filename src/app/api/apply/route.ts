import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { notify } from '@/lib/notifications'
import { runAutopilot } from '@/lib/ai/autopilot'
import { enqueue } from '@/lib/api/job-queue'
import { parseBody, handleSupabaseError } from '@/lib/api/helpers'
import { checkRateLimit } from '@/lib/api/rate-limit'
import { publicApplySchema } from '@/lib/validations/applications'
import { logger } from '@/lib/logger'
import type { CandidateInsert, ApplicationInsert, ApplicationEventInsert } from '@/lib/types/database'

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
  const { data: jobRaw, error: jobErr } = await supabase
    .from('hiring_requests')
    .select('id, org_id, position_title, status, auto_advance_score, auto_reject_score')
    .eq('apply_link_token', token)
    .single()

  if (jobErr || !jobRaw) {
    return NextResponse.json({ error: 'Invalid or expired apply link' }, { status: 404 })
  }

  const job = jobRaw as { id: string; org_id: string; position_title: string; status: string; auto_advance_score: number | null; auto_reject_score: number | null }

  // ── Upsert candidate ──────────────────────────────────────────────────────
  const { data: existingCandidate } = await supabase
    .from('candidates')
    .select('id')
    .eq('email', email)
    .single()

  let candidateId: string

  if (existingCandidate) {
    candidateId = (existingCandidate as { id: string }).id
  } else {
    const { data: newCandidate, error: createErr } = await supabase
      .from('candidates')
      .insert({
        name,
        email,
        phone: phone ?? null,
        resume_url: cv_url ?? null,
        skills: [],
        experience_years: 0,
        status: 'active',
        current_title: null,
        location: null,
        linkedin_url: null,
      } as unknown as CandidateInsert)
      .select('id')
      .single()

    if (createErr) return handleSupabaseError(createErr)
    candidateId = (newCandidate as { id: string }).id
  }

  // ── Get first pipeline stage ──────────────────────────────────────────────
  const { data: firstStageRaw } = await supabase
    .from('pipeline_stages')
    .select('id, name')
    .eq('hiring_request_id', job.id)
    .order('order_index')
    .limit(1)
    .single()
  const firstStage = firstStageRaw as { id: string; name: string } | null

  // ── Create application ────────────────────────────────────────────────────
  const { data: app, error: appErr } = await supabase
    .from('applications')
    .insert({
      candidate_id: candidateId,
      hiring_request_id: job.id,
      stage_id: firstStage?.id ?? null,
      status: 'active',
      source: 'applied',
      source_detail: null,
      resume_url: null,
      cover_letter: cover_letter ?? null,
      ai_score: null,
      ai_recommendation: null,
      ai_strengths: [],
      ai_gaps: [],
      ai_scored_at: null,
      ai_criterion_scores: null,
      credited_to: null,
    } as unknown as ApplicationInsert)
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

  const appId = (app as { id: string }).id

  // ── Timeline event ────────────────────────────────────────────────────────
  const noteParts: string[] = []
  if (linkedin_url) noteParts.push(`LinkedIn: ${linkedin_url}`)
  if (cv_url) noteParts.push(`CV: ${cv_url}`)

  await supabase
    .from('application_events')
    .insert({
      application_id: appId,
      event_type: 'applied',
      from_stage: null,
      to_stage: firstStage?.name ?? 'Applied',
      note: noteParts.length ? noteParts.join(' | ') : null,
      metadata: {},
      created_by: name,
    } as unknown as ApplicationEventInsert)

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
