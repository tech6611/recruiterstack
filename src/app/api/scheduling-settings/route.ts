import { NextResponse } from 'next/server'
import { withCapability } from '@/lib/api/helpers'
import { DEFAULT_REMINDER_LEAD_MINUTES } from '@/lib/interviews/reminders'

// Org-level interview scheduling settings. Kept separate from /api/org-settings
// (which is proxied to Django and doesn't know these columns) — read/written
// directly against Supabase here.
export const dynamic = 'force-dynamic'

// GET — current reminder intervals (minutes before the interview).
export const GET = withCapability('settings:view', async (_req, orgId, supabase) => {
  const { data } = await supabase
    .from('org_settings')
    .select('reminder_lead_minutes')
    .eq('org_id', orgId)
    .maybeSingle()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const arr = (data as any)?.reminder_lead_minutes
  const reminder_lead_minutes = Array.isArray(arr) ? arr : DEFAULT_REMINDER_LEAD_MINUTES
  return NextResponse.json({ reminder_lead_minutes })
})

// POST — save reminder intervals. Body: { reminder_lead_minutes: number[] }.
// Empty array = reminders off. Values are minutes-before-interview.
export const POST = withCapability('settings:edit', async (req, orgId, supabase) => {
  const body = await req.json().catch(() => ({}))
  const raw = body.reminder_lead_minutes
  if (!Array.isArray(raw)) {
    return NextResponse.json({ error: 'reminder_lead_minutes must be an array of minutes' }, { status: 400 })
  }
  // Positive integers only, ≤ 14 days, de-duped, at most 6 intervals, longest first.
  const clean = Array.from(
    new Set(raw.filter((n: unknown) => typeof n === 'number' && Number.isInteger(n) && n > 0 && n <= 20160)),
  ).sort((a, b) => b - a).slice(0, 6)

  const { error } = await supabase
    .from('org_settings')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .update({ reminder_lead_minutes: clean } as any)
    .eq('org_id', orgId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ reminder_lead_minutes: clean })
})
