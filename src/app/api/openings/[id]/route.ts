import { NextRequest, NextResponse } from 'next/server'
import { archiveEntity } from '@/lib/openings/seats'
import { createAdminClient } from '@/lib/supabase/server'
import { requireOrgAndUser } from '@/lib/auth'
import { getViewerScope, assertCapability } from '@/lib/rbac'
import { parseBody, handleSupabaseError } from '@/lib/api/helpers'
import { openingUpdateSchema } from '@/lib/validations/openings'
import { cancelApproval, submitForApproval, ApprovalError } from '@/lib/approvals/engine'
import { diffOpeningPatch, splitByGate, changesToMaps, changesToPatch } from '@/lib/openings/reapproval'
import { loadGatedFields, getPendingChange, applyOpeningPatch } from '@/lib/openings/change-requests'
import { writeAudit } from '@/lib/approvals/audit'
import type { Opening } from '@/lib/types/requisitions'

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const authResult = await requireOrgAndUser()
  if (authResult instanceof NextResponse) return authResult
  const { orgId, userId } = authResult

  const supabase = createAdminClient()
  const scope = await getViewerScope(supabase, orgId, userId)
  const denied = assertCapability(scope, 'openings:view')
  if (denied) return denied

  const { data, error } = await supabase
    .from('openings')
    .select('*')
    .eq('id', params.id)
    .eq('org_id', orgId)
    .single()

  if (error) return handleSupabaseError(error)

  // A hiring manager may only open their own requisition. Return 404 (not 403)
  // for anything else so we don't reveal that the requisition exists.
  if (scope.isHiringManager) {
    const o = data as { hiring_manager_id: string | null; recruiter_id: string | null } | null
    if (o && o.hiring_manager_id !== userId && o.recruiter_id !== userId) {
      return NextResponse.json({ error: 'Opening not found' }, { status: 404 })
    }
  }

  return NextResponse.json({ data })
}

/**
 * PATCH — edit a requisition.
 *
 *  draft            → free edit (as before).
 *  pending_approval → auto-cancels the in-flight approval, returns to draft, applies the edit.
 *  approved / open  → Ashby model: ordinary fields apply immediately (+ audit + version);
 *                     fields in the org's gated set create an opening_change_request that
 *                     re-runs the opening's approval chain on the diff. The opening STAYS
 *                     approved meanwhile. Response carries `pending_change` when one was made.
 *  filled/closed/archived → 409.
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const authResult = await requireOrgAndUser()
  if (authResult instanceof NextResponse) return authResult
  const { orgId, userId } = authResult

  const body = await parseBody(req, openingUpdateSchema)
  if (body instanceof NextResponse) return body

  const supabase = createAdminClient()
  const denied = assertCapability(await getViewerScope(supabase, orgId, userId), 'openings:edit')
  if (denied) return denied

  const { data: existing, error: fetchErr } = await supabase
    .from('openings').select('*').eq('id', params.id).eq('org_id', orgId).single()
  if (fetchErr) return handleSupabaseError(fetchErr)
  const row = existing as unknown as (Opening & Record<string, unknown>) | null
  if (!row) return NextResponse.json({ error: 'Opening not found' }, { status: 404 })

  // Zod's .partial() leaves absent keys undefined — strip them so they don't
  // read as "set to null" in the diff.
  const patch: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(body)) if (v !== undefined) patch[k] = v

  // ── Approved / open: field-level gating ─────────────────────────────
  if (row.status === 'approved' || row.status === 'open') {
    const changes = diffOpeningPatch(row, patch)
    if (changes.length === 0) return NextResponse.json({ data: row, applied_fields: [], gated_fields: [], pending_change: null })

    const gatedSet = await loadGatedFields(supabase, orgId)
    const { immediate, gated } = splitByGate(changes, gatedSet)

    let pendingChange: Record<string, unknown> | null = null
    if (gated.length > 0) {
      const already = await getPendingChange(supabase, orgId, row.id)
      if (already) {
        return NextResponse.json(
          { error: 'A change to this requisition is already awaiting approval. Cancel it before proposing another.', pending_change: already },
          { status: 409 },
        )
      }
      const { previous, proposed } = changesToMaps(gated)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: cr, error: crErr } = await (supabase as any).from('opening_change_requests')
        .insert({ org_id: orgId, opening_id: row.id, previous, proposed, requested_by: userId })
        .select().single()
      if (crErr?.code === '42P01') {
        return NextResponse.json(
          { error: 'Re-approval of requisition changes needs database migration 140 (opening_change_requests). Ask an admin to apply it, then try again.' },
          { status: 503 },
        )
      }
      if (crErr) return handleSupabaseError(crErr)

      // Re-run the OPENING chain with the proposed values merged in, so scope
      // and conditional steps see the requisition as it would become.
      let result
      try {
        result = await submitForApproval({
          orgId, targetType: 'opening_change', chainTargetType: 'opening',
          targetId: cr.id, target: { ...row, ...changesToPatch(gated, row) }, requesterId: userId,
        })
      } catch (err) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any).from('opening_change_requests').delete().eq('id', cr.id)
        if (err instanceof ApprovalError) return NextResponse.json({ error: err.message }, { status: err.status })
        throw err
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any).from('opening_change_requests').update({ approval_id: result.approvalId }).eq('id', cr.id)
      await writeAudit({
        org_id: orgId, approval_id: result.approvalId, target_type: 'opening', target_id: row.id,
        actor_user_id: userId, action: 'change_requested', from_state: row.status, to_state: row.status,
        metadata: { change_request_id: cr.id, fields: gated.map(c => c.field), auto_approved: result.status === 'approved' },
      })
      // The engine may have auto-approved (requester is the only approver) and
      // already applied the change; report the final state either way.
      pendingChange = result.status === 'approved' ? null : { ...cr, approval_id: result.approvalId }
    }

    let updated: Record<string, unknown> = row
    if (immediate.length > 0) {
      updated = await applyOpeningPatch(supabase, orgId, row.id, changesToPatch(immediate, row), {
        actorUserId: userId, reason: 'edited', changedFields: immediate.map(c => c.field),
      })
      await writeAudit({
        org_id: orgId, target_type: 'opening', target_id: row.id, actor_user_id: userId,
        action: 'edited', from_state: row.status, to_state: row.status, metadata: { fields: immediate.map(c => c.field) },
      })
    } else if (pendingChange === null && gated.length > 0) {
      const { data: fresh } = await supabase.from('openings').select('*').eq('id', row.id).single()
      updated = (fresh as unknown as Record<string, unknown>) ?? row
    }
    return NextResponse.json({
      data: updated, applied_fields: immediate.map(c => c.field), gated_fields: gated.map(c => c.field), pending_change: pendingChange,
    })
  }

  // ── Mid-approval edit: cancel the in-flight approval, back to draft, apply ──
  if (row.status === 'pending_approval' && row.approval_id) {
    try {
      await cancelApproval(row.approval_id, userId)
      await writeAudit({
        org_id: orgId, approval_id: row.approval_id, target_type: 'opening', target_id: row.id,
        actor_user_id: userId, action: 'edit_cancelled', from_state: 'pending', to_state: 'cancelled',
        metadata: { reason: 'opening edited mid-approval' },
      })
    } catch (err) {
      if (err instanceof ApprovalError) return NextResponse.json({ error: err.message }, { status: err.status })
      throw err
    }
  } else if (row.status !== 'draft') {
    const hint = row.status === 'archived' ? 'Unarchive it first.' : `A ${row.status} requisition can't be edited.`
    return NextResponse.json({ error: `Cannot edit a requisition with status '${row.status}'. ${hint}` }, { status: 409 })
  }

  // Recompute out_of_band if comp fields or band changed.
  const bandId = (patch.comp_band_id ?? row.comp_band_id) as string | null
  const min    = (patch.comp_min     ?? row.comp_min)     as number | null
  const max    = (patch.comp_max     ?? row.comp_max)     as number | null
  if (bandId && (min !== null || max !== null)) {
    const { data: band } = await supabase
      .from('compensation_bands').select('min_salary, max_salary').eq('id', bandId).eq('org_id', orgId).maybeSingle()
    if (band) {
      const b = band as { min_salary: number; max_salary: number }
      patch.out_of_band = (min !== null && Number(min) < b.min_salary) || (max !== null && Number(max) > b.max_salary)
    }
  }

  const { data, error } = await supabase
    .from('openings').update(patch).eq('id', params.id).eq('org_id', orgId).select().single()
  if (error) return handleSupabaseError(error)
  return NextResponse.json({ data, applied_fields: Object.keys(patch), gated_fields: [], pending_change: null })
}

/**
 * DELETE — soft-archive by setting status='archived'.
 * Aligns with our "no soft-delete columns" decision: status enum doubles as
 * the lifecycle signal.
 */
export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const authResult = await requireOrgAndUser()
  if (authResult instanceof NextResponse) return authResult
  const { orgId, userId } = authResult

  const supabase = createAdminClient()
  const denied = assertCapability(await getViewerScope(supabase, orgId, userId), 'openings:edit')
  if (denied) return denied

  const archived = await archiveEntity(supabase, orgId, 'openings', params.id, userId)
  if (!archived) return NextResponse.json({ error: 'Opening not found' }, { status: 404 })
  const { data, error } = await supabase
    .from('openings')
    .select('*')
    .eq('id', params.id)
    .eq('org_id', orgId)
    .single()

  if (error) return handleSupabaseError(error)
  return NextResponse.json({ data })
}
