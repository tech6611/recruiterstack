import { NextResponse } from 'next/server'
import { withOrg, parseBody, handleSupabaseError } from '@/lib/api/helpers'
import { applicationInsertSchema } from '@/lib/validations/applications'
import { createNotification } from '@/lib/api/notify'
import type { ApplicationInsert, ApplicationEventInsert } from '@/lib/types/database'

// POST /api/applications
// Adds a candidate to a job pipeline.
export const POST = withOrg(async (req, orgId, supabase) => {
  const body = await parseBody(req, applicationInsertSchema)
  if (body instanceof NextResponse) return body

  const { hiring_request_id, stage_id, source, source_detail, candidate_id, candidate_data } = body

  let resolvedCandidateId = candidate_id

  // ── Upsert candidate if candidate_data provided ───────────────────────────
  if (!resolvedCandidateId && candidate_data) {
    const { data: existingData } = await supabase
      .from('candidates')
      .select('id')
      .eq('email', candidate_data.email)
      .eq('org_id', orgId)
      .single()
    const existing = existingData as { id: string } | null

    if (existing) {
      resolvedCandidateId = existing.id
    } else {
      const { data: createdData, error: createErr } = await supabase
        .from('candidates')
        .insert({
          name: candidate_data.name,
          email: candidate_data.email,
          phone: candidate_data.phone ?? null,
          current_title: candidate_data.current_title ?? null,
          location: candidate_data.location ?? null,
          skills: [],
          experience_years: 0,
          status: 'active',
        })
        .select('id')
        .single()

      if (createErr) return handleSupabaseError(createErr)
      const created = createdData as { id: string }
      resolvedCandidateId = created.id
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
    const { data: stageRowData } = await supabase
      .from('pipeline_stages')
      .select('name')
      .eq('id', resolvedStageId)
      .single()
    const stageRow = stageRowData as { name: string } | null
    if (stageRow) stageName = stageRow.name
  }

  // ── Create application ────────────────────────────────────────────────────
  const { data: appData, error: appErr } = await supabase
    .from('applications')
    .insert({
      candidate_id: resolvedCandidateId,
      hiring_request_id,
      stage_id: resolvedStageId ?? null,
      status: 'active',
      source,
      source_detail: source_detail ?? null,
    } as ApplicationInsert)
    .select('*, candidate:candidates(*)')
    .single()

  if (appErr) return handleSupabaseError(appErr)
  const app = appData as Record<string, unknown> & { id: string; candidate?: { name: string } }

  // ── Record timeline event ─────────────────────────────────────────────────
  await supabase
    .from('application_events')
    .insert({
      application_id: app.id,
      event_type: 'applied',
      to_stage: stageName,
      created_by: 'Recruiter',
      org_id: orgId,
    } as ApplicationEventInsert)

  // ── In-app notification ─────────────────────────────────────────────────
  const candidateName = app.candidate?.name ?? 'Candidate'
  await createNotification({
    orgId,
    type: 'candidate_applied',
    title: `Application created: ${candidateName}`,
    resourceType: 'application',
    resourceId: app.id,
  })

  return NextResponse.json({ data: app }, { status: 201 })
})
