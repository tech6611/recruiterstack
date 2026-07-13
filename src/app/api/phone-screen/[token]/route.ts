import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getCanonicalCandidateJobContext } from '@/modules/ats/domain/job-pipelines'
import { logger } from '@/lib/logger'

// Public, no auth — the token in the URL is the bearer credential.
export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

// A single candidate-selected window. Times are ISO UTC.
interface Slot { start: string; end: string }

const MAX_SLOTS = 100

// GET /api/phone-screen/[token] — public.
// Returns the candidacy context (candidate name + role) plus any windows the
// candidate has already submitted, so re-opening the link shows their picks.
export async function GET(_req: NextRequest, { params }: { params: { token: string } }) {
  const { token } = params
  const supabase = createAdminClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: reqRow, error } = await (supabase as any)
    .from('phone_screen_requests')
    .select('*, candidate:candidates(name)')
    .eq('token', token)
    .maybeSingle()

  if (error || !reqRow) {
    return NextResponse.json({ error: 'Invalid or expired scheduling link' }, { status: 404 })
  }
  if (reqRow.expires_at && new Date(reqRow.expires_at) < new Date()) {
    return NextResponse.json(
      { error: 'This link has expired. Please contact your recruiter for a new one.' },
      { status: 410 },
    )
  }

  // Role title is cosmetic — never fail the page over it.
  let positionTitle: string | null = null
  try {
    const ctx = await getCanonicalCandidateJobContext(supabase, reqRow.org_id, reqRow.application_id)
    positionTitle = ctx?.job?.position_title ?? null
  } catch { /* non-fatal */ }

  return NextResponse.json({
    token,
    status:          reqRow.status,
    candidate_name:  reqRow.candidate?.name ?? null,
    position_title:  positionTitle,
    expires_at:      reqRow.expires_at,
    preferred_slots: (reqRow.preferred_slots ?? []) as Slot[],
    timezone:        reqRow.timezone ?? null,
  }, { headers: { 'Cache-Control': 'no-store' } })
}

// POST /api/phone-screen/[token] — public. The candidate submits the windows
// they're comfortable being called in. No calendar check: an AI places the call.
export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  const { token } = params
  const supabase = createAdminClient()

  let body: { slots?: unknown; timezone?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  // Validate the submitted windows — this is untrusted public input.
  if (!Array.isArray(body.slots) || body.slots.length === 0) {
    return NextResponse.json({ error: 'Please pick at least one time that works for you.' }, { status: 400 })
  }
  if (body.slots.length > MAX_SLOTS) {
    return NextResponse.json({ error: 'Too many time slots selected.' }, { status: 400 })
  }
  const slots: Slot[] = []
  for (const raw of body.slots) {
    if (!raw || typeof raw !== 'object') {
      return NextResponse.json({ error: 'Invalid time slot.' }, { status: 400 })
    }
    const { start, end } = raw as { start?: unknown; end?: unknown }
    if (typeof start !== 'string' || typeof end !== 'string') {
      return NextResponse.json({ error: 'Invalid time slot.' }, { status: 400 })
    }
    const s = new Date(start), e = new Date(end)
    if (isNaN(s.getTime()) || isNaN(e.getTime()) || e <= s) {
      return NextResponse.json({ error: 'Invalid time slot.' }, { status: 400 })
    }
    slots.push({ start: s.toISOString(), end: e.toISOString() })
  }
  const timezone = typeof body.timezone === 'string' ? body.timezone.slice(0, 64) : null

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: reqRow } = await (supabase as any)
    .from('phone_screen_requests')
    .select('id, expires_at')
    .eq('token', token)
    .maybeSingle()
  if (!reqRow) {
    return NextResponse.json({ error: 'Invalid or expired scheduling link' }, { status: 404 })
  }
  if (reqRow.expires_at && new Date(reqRow.expires_at) < new Date()) {
    return NextResponse.json(
      { error: 'This link has expired. Please contact your recruiter for a new one.' },
      { status: 410 },
    )
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: updErr } = await (supabase as any)
    .from('phone_screen_requests')
    .update({
      preferred_slots: slots,
      timezone,
      status:          'submitted',
      submitted_at:    new Date().toISOString(),
      updated_at:      new Date().toISOString(),
    })
    .eq('id', reqRow.id)
  if (updErr) {
    logger.error('[phone-screen] failed to save preferred slots', updErr)
    return NextResponse.json({ error: 'Could not save your times. Please try again.' }, { status: 500 })
  }

  return NextResponse.json({ success: true, count: slots.length })
}
