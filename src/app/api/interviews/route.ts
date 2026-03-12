import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireOrg } from '@/lib/auth'
import { randomBytes } from 'crypto'

export async function GET(req: NextRequest) {
  const authResult = await requireOrg()
  if (authResult instanceof NextResponse) return authResult
  const { orgId } = authResult

  const supabase = createAdminClient()
  const { searchParams } = req.nextUrl
  const application_id      = searchParams.get('application_id')
  const candidate_id        = searchParams.get('candidate_id')
  const hiring_request_id   = searchParams.get('hiring_request_id')
  const upcoming            = searchParams.get('upcoming') === 'true'

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q: any = supabase
    .from('interviews')
    .select('*, candidate:candidates(name, email), hiring_request:hiring_requests(position_title, ticket_number)')
    .eq('org_id', orgId)

  if (application_id)    q = q.eq('application_id', application_id)
  if (candidate_id)      q = q.eq('candidate_id', candidate_id)
  if (hiring_request_id) q = q.eq('hiring_request_id', hiring_request_id)
  if (upcoming)          q = q.gte('scheduled_at', new Date().toISOString()).eq('status', 'scheduled')

  const { data, error } = await q.order('scheduled_at', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: data ?? [] })
}

export async function POST(req: NextRequest) {
  const authResult = await requireOrg()
  if (authResult instanceof NextResponse) return authResult
  const { orgId } = authResult

  const body = await req.json()
  const {
    application_id, candidate_id, hiring_request_id, stage_id,
    interviewer_name, interview_type, scheduled_at, duration_minutes,
    location, notes, generate_self_schedule,
  } = body

  if (!application_id || !candidate_id || !hiring_request_id || !interviewer_name?.trim() || !scheduled_at) {
    return NextResponse.json(
      { error: 'application_id, candidate_id, hiring_request_id, interviewer_name, and scheduled_at are required' },
      { status: 400 },
    )
  }

  const supabase = createAdminClient()

  // Generate self-schedule token if requested
  const self_schedule_token   = generate_self_schedule ? randomBytes(20).toString('hex') : null
  const expires = new Date()
  expires.setDate(expires.getDate() + 7)
  const self_schedule_expires_at = generate_self_schedule ? expires.toISOString() : null

  const { data, error } = await supabase
    .from('interviews')
    .insert({
      org_id:            orgId,
      application_id,
      candidate_id,
      hiring_request_id,
      stage_id:          stage_id ?? null,
      interviewer_name:  interviewer_name.trim(),
      interview_type:    interview_type ?? 'video',
      scheduled_at,
      duration_minutes:  duration_minutes ?? 60,
      location:          location?.trim() || null,
      notes:             notes?.trim() || null,
      status:            'scheduled',
      self_schedule_token,
      self_schedule_expires_at,
    } as any)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Log application event
  await supabase.from('application_events').insert({
    application_id,
    org_id:       orgId,
    event_type:   'interview_scheduled',
    note:         `Interview scheduled with ${interviewer_name.trim()} — ${new Date(scheduled_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}`,
    metadata:     { interview_id: (data as any).id, interview_type: interview_type ?? 'video', duration_minutes: duration_minutes ?? 60 },
    created_by:   orgId,
  } as any)

  return NextResponse.json({ data }, { status: 201 })
}
