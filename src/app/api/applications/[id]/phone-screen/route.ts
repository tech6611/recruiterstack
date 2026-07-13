import { NextResponse } from 'next/server'
import { withCapability } from '@/lib/api/helpers'

// GET /api/applications/[id]/phone-screen
// Recruiter-side: the windows this candidate submitted for their AI phone screen,
// so we can see when they're free right where we launch the call. Returns the
// most recent request for the application (or nulls when none exists yet).
export const GET = withCapability('recruiting:view', async (_request, orgId, supabase, { params }) => {
  const applicationId = params.id

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any)
    .from('phone_screen_requests')
    .select('status, preferred_slots, timezone, submitted_at')
    .eq('org_id', orgId)
    .eq('application_id', applicationId)
    .order('created_at', { ascending: false })
    .limit(1)

  const row = (data as {
    status: string
    preferred_slots: { start: string; end: string }[]
    timezone: string | null
    submitted_at: string | null
  }[] | null)?.[0]

  if (!row || row.status !== 'submitted') {
    return NextResponse.json({ submitted: false, slots: [], timezone: null, submitted_at: null })
  }

  return NextResponse.json({
    submitted:    true,
    slots:        row.preferred_slots ?? [],
    timezone:     row.timezone,
    submitted_at: row.submitted_at,
  })
})
