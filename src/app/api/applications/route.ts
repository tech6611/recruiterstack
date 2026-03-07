import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import type { Candidate } from '@/lib/types/database'

// POST /api/applications
// Adds a candidate to a job pipeline.
// body: {
//   hiring_request_id: string
//   stage_id?: string         (defaults to first stage)
//   source?: string
//   source_detail?: string
//   candidate_id?: string     (existing candidate)
//   candidate_data?: { name, email, phone?, current_title?, location? }  (new/upsert)
// }
export async function POST(request: NextRequest) {
  const supabase = createAdminClient()

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { hiring_request_id, stage_id, source = 'manual', source_detail, candidate_id, candidate_data } =
    body as {
      hiring_request_id: string
      stage_id?: string
      source?: string
      source_detail?: string
      candidate_id?: string
      candidate_data?: Partial<Candidate> & { name: string; email: string }
    }

  if (!hiring_request_id) {
    return NextResponse.json({ error: 'hiring_request_id required' }, { status: 400 })
  }

  let resolvedCandidateId = candidate_id

  // ── Upsert candidate if candidate_data provided ───────────────────────────
  if (!resolvedCandidateId && candidate_data) {
    if (!candidate_data.name || !candidate_data.email) {
      return NextResponse.json({ error: 'candidate_data.name and .email required' }, { status: 400 })
    }

    const { data: existing } = await supabase
      .from('candidates')
      .select('id')
      .eq('email', candidate_data.email.toLowerCase())
      .single()

    if (existing) {
      resolvedCandidateId = existing.id
    } else {
      const { data: created, error: createErr } = await supabase
        .from('candidates')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .insert({
          name: candidate_data.name,
          email: candidate_data.email.toLowerCase(),
          phone: candidate_data.phone ?? null,
          current_title: candidate_data.current_title ?? null,
          location: candidate_data.location ?? null,
          skills: [],
          experience_years: 0,
          status: 'active',
        } as any)
        .select('id')
        .single()

      if (createErr) {
        return NextResponse.json({ error: createErr.message }, { status: 500 })
      }
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
    } as any)
    .select('*, candidates(*)')
    .single()

  if (appErr) {
    const status = appErr.code === '23505' ? 409 : 500
    return NextResponse.json({ error: appErr.message }, { status })
  }

  // ── Record timeline event ─────────────────────────────────────────────────
  await supabase
    .from('application_events')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .insert({
      application_id: app.id,
      event_type: 'applied',
      to_stage: stageName,
      created_by: 'Recruiter',
    } as any)

  return NextResponse.json({ data: app }, { status: 201 })
}
