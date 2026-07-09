import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { checkRateLimit } from '@/lib/api/rate-limit'
import {
  getInterviewerPreferenceByToken,
  saveInterviewerPreferenceByToken,
  DEFAULT_WINDOWS,
  type AvailabilityWindow,
} from '@/modules/ats/domain/interviewer-preferences'

// GET /api/interviewer/:token — validate token, return the interviewer's
// current preferences (or the Mon–Fri 9–6 default) for the no-login edit page.
export async function GET(req: NextRequest, { params }: { params: { token: string } }) {
  const rateLimited = await checkRateLimit(req)
  if (rateLimited) return rateLimited

  const supabase = createAdminClient()
  const pref = await getInterviewerPreferenceByToken(supabase, params.token)
  if (!pref) {
    return NextResponse.json({ error: 'Invalid or expired link' }, { status: 404 })
  }

  return NextResponse.json({
    data: {
      email:    pref.email,
      name:     pref.name,
      timezone: pref.timezone,
      // Empty windows → show the default so the HM starts from a sensible grid.
      windows:  pref.windows.length ? pref.windows : DEFAULT_WINDOWS,
      note:     pref.note,
    },
  })
}

// POST /api/interviewer/:token — HM saves their weekly availability.
export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  const rateLimited = await checkRateLimit(req)
  if (rateLimited) return rateLimited

  const supabase = createAdminClient()
  const pref = await getInterviewerPreferenceByToken(supabase, params.token)
  if (!pref) {
    return NextResponse.json({ error: 'Invalid or expired link' }, { status: 404 })
  }

  let body: { timezone?: string; windows?: unknown; note?: string | null }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const timezone = typeof body.timezone === 'string' && body.timezone.trim() ? body.timezone.trim() : null
  if (!timezone) {
    return NextResponse.json({ error: 'A timezone is required.' }, { status: 400 })
  }

  const windows = sanitizeWindows(body.windows)
  if (windows === null) {
    return NextResponse.json({ error: 'Availability windows are invalid.' }, { status: 400 })
  }

  const note = typeof body.note === 'string' ? body.note.slice(0, 2000) : null

  const ok = await saveInterviewerPreferenceByToken(supabase, params.token, { timezone, windows, note })
  if (!ok) {
    return NextResponse.json({ error: 'Failed to save. Please try again.' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}

/**
 * Validate/normalize the posted windows. Returns a clean array, or null if the
 * shape is wrong. Each window must be a weekday-or-weekend index 0–6 with
 * 0 ≤ start < end ≤ 1440 (minutes from midnight). An empty array is allowed
 * (interviewer takes no interviews / not set).
 */
function sanitizeWindows(raw: unknown): AvailabilityWindow[] | null {
  if (!Array.isArray(raw)) return null
  const out: AvailabilityWindow[] = []
  for (const w of raw) {
    if (typeof w !== 'object' || w === null) return null
    const { day, start, end } = w as Record<string, unknown>
    if (typeof day !== 'number' || day < 0 || day > 6 || !Number.isInteger(day)) return null
    if (typeof start !== 'number' || typeof end !== 'number') return null
    if (start < 0 || end > 1440 || start >= end) return null
    out.push({ day, start: Math.round(start), end: Math.round(end) })
  }
  return out
}
