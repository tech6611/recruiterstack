import { NextResponse } from 'next/server'
import { withOrg, parseBody, handleSupabaseError } from '@/lib/api/helpers'
import { applicationInsertSchema } from '@/lib/validations/applications'
import { createNotification } from '@/lib/api/notify'
import { findOrCreateCandidateProfile } from '@/modules/ats/domain/candidates'
import { createApplication, recordApplicationEvent } from '@/modules/ats/domain/applications'

// POST /api/applications
// Adds a candidate to a job pipeline.
export const POST = withOrg(async (req, orgId, supabase) => {
  const body = await parseBody(req, applicationInsertSchema)
  if (body instanceof NextResponse) return body

  const { hiring_request_id, stage_id, source, source_detail, candidate_id, candidate_data } = body

  let resolvedCandidateId = candidate_id

  // ── Upsert candidate if candidate_data provided ───────────────────────────
  if (!resolvedCandidateId && candidate_data) {
    try {
      const candidate = await findOrCreateCandidateProfile(supabase, orgId, {
        name: candidate_data.name,
        email: candidate_data.email,
        phone: candidate_data.phone ?? null,
        current_title: candidate_data.current_title ?? null,
        location: candidate_data.location ?? null,
      })
      resolvedCandidateId = candidate.id
    } catch (err) {
      return handleSupabaseError(err as { code: string; message: string })
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
    resolvedStageId = firstStage?.id ?? undefined
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
  let app: Awaited<ReturnType<typeof createApplication>>
  try {
    app = await createApplication(supabase, {
      orgId,
      candidateId: resolvedCandidateId,
      hiringRequestId: hiring_request_id,
      stageId: resolvedStageId ?? null,
      source,
      sourceDetail: source_detail ?? null,
    })
  } catch (err) {
    return handleSupabaseError(err as { code: string; message: string })
  }

  // ── Record timeline event ─────────────────────────────────────────────────
  await recordApplicationEvent(supabase, {
      application_id: app.id,
      event_type: 'applied',
      to_stage: stageName,
      created_by: 'Recruiter',
      org_id: orgId,
    })

  // ── In-app notification ─────────────────────────────────────────────────
  const candidateName = candidate_data?.name ?? 'Candidate'
  await createNotification({
    orgId,
    type: 'candidate_applied',
    title: `Application created: ${candidateName}`,
    resourceType: 'application',
    resourceId: app.id,
  })

  return NextResponse.json({ data: app }, { status: 201 })
})
