import { NextResponse } from 'next/server'
import { withCapability } from '@/lib/api/helpers'
import { scheduleInterviewWithMeeting } from '@/lib/interviews/schedule'

export const GET = withCapability('recruiting:view', async (req, orgId, supabase) => {
  const { searchParams } = req.nextUrl
  const application_id      = searchParams.get('application_id')
  const candidate_id        = searchParams.get('candidate_id')
  const hiring_request_id   = searchParams.get('hiring_request_id')
  const upcoming            = searchParams.get('upcoming') === 'true'

  // Legacy interviews carry the title on hiring_requests; canonical ones anchor
  // on the application's job, so also resolve the title via applications→jobs and
  // fold it onto `hiring_request` below (interviews have no direct job_id).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q: any = supabase
    .from('interviews')
    .select('*, candidate:candidates(name, email), application:applications(job:jobs(position_title:title))')
    .eq('org_id', orgId)

  if (application_id)    q = q.eq('application_id', application_id)
  if (candidate_id)      q = q.eq('candidate_id', candidate_id)
  if (hiring_request_id) q = q.eq('hiring_request_id', hiring_request_id)
  if (upcoming)          q = q.gte('scheduled_at', new Date().toISOString()).eq('status', 'scheduled')

  const { data, error } = await q.order('scheduled_at', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: normalizeJobTitle(data) })
})

/** Fold a canonical job title (application→jobs) onto the `hiring_request` shape
 *  the UI reads, for rows with no legacy hiring_requests row. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeJobTitle(rows: any[] | null): any[] {
  return (rows ?? []).map(r => {
    if (!r.hiring_request && r.application?.job) {
      r.hiring_request = { position_title: r.application.job.position_title ?? null, ticket_number: null }
    }
    return r
  })
}

export const POST = withCapability('recruiting:edit', async (req, orgId, supabase) => {
  const body = await req.json()
  // Logic shared with the copilot's schedule_interview tool.
  const r = await scheduleInterviewWithMeeting(supabase, orgId, body)
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status })
  return NextResponse.json({ data: r.data }, { status: 201 })
})
