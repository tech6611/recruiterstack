import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

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
// body: { token, name, email, phone?, linkedin_url?, cover_letter? }
export async function POST(request: NextRequest) {
  const supabase = createAdminClient()

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { token, name, email, phone, linkedin_url, cover_letter } = body as {
    token: string
    name: string
    email: string
    phone?: string
    linkedin_url?: string
    cover_letter?: string
  }

  if (!token || !name || !email) {
    return NextResponse.json({ error: 'token, name, and email are required' }, { status: 400 })
  }

  // ── Verify token & get job ────────────────────────────────────────────────
  const { data: job, error: jobErr } = await supabase
    .from('hiring_requests')
    .select('id, position_title, status')
    .eq('apply_link_token', token)
    .single()

  if (jobErr || !job) {
    return NextResponse.json({ error: 'Invalid or expired apply link' }, { status: 404 })
  }

  // ── Upsert candidate ──────────────────────────────────────────────────────
  const { data: existingCandidate } = await supabase
    .from('candidates')
    .select('id')
    .eq('email', email.toLowerCase())
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
        email: email.toLowerCase(),
        phone: phone ?? null,
        skills: [],
        experience_years: 0,
        status: 'active',
      } as any)
      .select('id')
      .single()

    if (createErr) {
      return NextResponse.json({ error: createErr.message }, { status: 500 })
    }
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
    // Duplicate — already applied
    if (appErr.code === '23505') {
      return NextResponse.json(
        { error: 'You have already applied for this role.' },
        { status: 409 }
      )
    }
    return NextResponse.json({ error: appErr.message }, { status: 500 })
  }

  // ── Timeline event ────────────────────────────────────────────────────────
  await supabase
    .from('application_events')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .insert({
      application_id: app!.id,
      event_type: 'applied',
      to_stage: firstStage?.name ?? 'Applied',
      note: linkedin_url ? `LinkedIn: ${linkedin_url}` : null,
      created_by: name,
    } as any)

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
