import { NextResponse } from 'next/server'
import { withOrg, parseBody, handleSupabaseError } from '@/lib/api/helpers'
import { applicationInsertSchema } from '@/lib/validations/applications'
import { createNotification } from '@/lib/api/notify'

// POST /api/applications
// Adds a candidate to a job pipeline.
export const POST = withOrg(async (req, orgId, supabase) => {
  const body = await parseBody(req, applicationInsertSchema)
  if (body instanceof NextResponse) return body

  const { hiring_request_id, stage_id, source, source_detail, candidate_id, candidate_data } = body

  let resolvedCandidateId = candidate_id

  // ── Upsert candidate if candidate_data provided ───────────────────────────
  if (!resolvedCandidateId && candidate_data) {
    const { data: existing } = await supabase
      .from('candidates')
      .select('id')
      .eq('email', candidate_data.email)
      .eq('org_id', orgId)
      .single()

    if (existing) {
      resolvedCandidateId = existing.id
    } else {
      const { data: created, error: createErr } = await supabase
        .from('candidates')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .insert({
          name: candidate_data.name,
          email: candidate_data.email,
          phone: candidate_data.phone ?? null,
          current_title: candidate_data.current_title ?? null,
          location: candidate_data.location ?? null,
          skills: [],
          experience_years: 0,
          status: 'active',
          org_id: orgId,
        } as any)
        .select('id')
        .single()

      if (createErr) return handleSupabaseError(createErr)
      resolvedCandidateId = created!.id
    }
  }

  if (!resolvedCandidateId) {
    return NextResponse.json({ error: 'candidate_id or candidate_data required' }, { status: 400 })
  }

  // ── Resolve stage (default to first stage) ────────────────────────────────
  let resolvedStageId = stage_id
  if (!resolvedStageId) {
    const { data: firstStage } = await supabase
      .from('pipeline_stages')
      .select('id')
      .eq('hiring_request_id', hiring_request_id)
      .order('order_index')
      .limit(1)
      .single()
    resolvedStageId = firstStage?.id ?? null
  }

  // ── Get stage name for timeline event ─────────────────────────────────────
  let stageName = 'Applied'
  if (resolvedStageId) {
    const { data: stageRow } = await supabase
      .from('pipeline_stages')
      .select('name')
      .eq('id', resolvedStageId)
      .single()
    if (stageRow) stageName = stageRow.name
  }

  // ── Create application ────────────────────────────────────────────────────
  const { data: app, error: appErr } = await supabase
    .from('applications')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .insert({
      candidate_id: resolvedCandidateId,
      hiring_request_id,
      stage_id: resolvedStageId ?? null,
      status: 'active',
      source,
      source_detail: source_detail ?? null,
      org_id: orgId,
    } as any)
    .select('*, candidate:candidates(*)')
    .single()

  if (appErr) return handleSupabaseError(appErr)

  // ── Record timeline event ─────────────────────────────────────────────────
  await supabase
    .from('application_events')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .insert({
      application_id: app.id,
      event_type: 'applied',
      to_stage: stageName,
      created_by: 'Recruiter',
      org_id: orgId,
    } as any)

  // ── In-app notification ─────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const candidateName = (app as any).candidate?.name ?? 'Candidate'
  await createNotification({
    orgId,
    type: 'candidate_applied',
    title: `Application created: ${candidateName}`,
    resourceType: 'application',
    resourceId: app.id,
  })

  return NextResponse.json({ data: app }, { status: 201 })
})
