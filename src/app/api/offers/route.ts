import { NextResponse } from 'next/server'
import { withCapability, parseBody, handleSupabaseError } from '@/lib/api/helpers'
import { offerInsertSchema } from '@/lib/validations/offers'

export const GET = withCapability('recruiting:view', async (req, orgId, supabase) => {
  const { searchParams } = req.nextUrl
  const application_id    = searchParams.get('application_id')
  const candidate_id      = searchParams.get('candidate_id')
  const hiring_request_id = searchParams.get('hiring_request_id')
  const status            = searchParams.get('status')

  // Legacy offers carry the title on hiring_requests; canonical ones resolve it
  // via the application's job (offers have no direct job_id). Fold onto
  // `hiring_request` below. (Offers also store their own position_title column.)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q: any = supabase
    .from('offers')
    .select('*, candidate:candidates(name, email), hiring_request:hiring_requests(position_title, ticket_number), application:applications(job:jobs(position_title:title))')
    .eq('org_id', orgId)

  if (application_id)    q = q.eq('application_id', application_id)
  if (candidate_id)      q = q.eq('candidate_id', candidate_id)
  if (hiring_request_id) q = q.eq('hiring_request_id', hiring_request_id)
  if (status)            q = q.eq('status', status)

  const { data, error } = await q.order('created_at', { ascending: false })
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
  const parsed = await parseBody(req, offerInsertSchema)
  if (parsed instanceof NextResponse) return parsed

  const { data, error } = await supabase
    .from('offers')
    .insert({
      org_id: orgId,
      ...parsed,
    })
    .select()
    .single()

  if (error) return handleSupabaseError(error)

  // Log application event
  await supabase.from('application_events').insert({
    application_id: parsed.application_id,
    org_id:     orgId,
    event_type: 'offer_created',
    note:       `Offer created — ${parsed.position_title}${parsed.base_salary ? ` · $${Number(parsed.base_salary).toLocaleString()}` : ''}`,
    metadata:   { offer_id: data.id },
    created_by: orgId,
  })

  // Update candidate status to offer_extended
  await supabase
    .from('candidates')
    .update({ status: 'offer_extended', updated_at: new Date().toISOString() })
    .eq('id', parsed.candidate_id)
    .eq('org_id', orgId)

  return NextResponse.json({ data }, { status: 201 })
})
