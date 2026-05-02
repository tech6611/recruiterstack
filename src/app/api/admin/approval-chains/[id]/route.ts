import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireOrgAndUser } from '@/lib/auth'
import { requireAdmin } from '@/lib/auth-admin'
import { parseBody, handleSupabaseError } from '@/lib/api/helpers'
import { chainUpdateSchema } from '@/lib/validations/approval-chains'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireOrgAndUser()
  if (auth instanceof NextResponse) return auth

  const supabase = createAdminClient()
  const { data: chain } = await supabase
    .from('approval_chains')
    .select('*')
    .eq('id', params.id)
    .eq('org_id', auth.orgId)
    .maybeSingle()
  if (!chain) return NextResponse.json({ error: 'Chain not found' }, { status: 404 })

  const { data: steps } = await supabase
    .from('approval_chain_steps')
    .select('*')
    .eq('chain_id', params.id)
    .order('step_index', { ascending: true })

  return NextResponse.json({ data: { chain, steps: steps ?? [] } })
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth

  const body = await parseBody(req, chainUpdateSchema)
  if (body instanceof NextResponse) return body

  const supabase = createAdminClient()
  const patch: Record<string, unknown> = {}
  if (body.name             !== undefined) patch.name             = body.name
  if (body.description      !== undefined) patch.description      = body.description
  if (body.scope_conditions !== undefined) patch.scope_conditions = body.scope_conditions
  if (body.is_active        !== undefined) patch.is_active        = body.is_active

  if (Object.keys(patch).length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await supabase.from('approval_chains').update(patch as any)
      .eq('id', params.id).eq('org_id', auth.orgId)
    if (error) return handleSupabaseError(error)
  }

  // Steps reconcile-by-step_index strategy.
  //
  // Why not delete-and-reinsert: approval_steps.chain_step_id is FK with
  // ON DELETE RESTRICT, so Postgres rejects the delete the moment any in-flight
  // approval references one of these chain_steps. That's a near-certainty in
  // any live workspace and made the editor unusable.
  //
  // Strategy:
  //   - UPDATE rows whose step_index appears in both old + new (preserves
  //     chain_step_id; in-flight FK references stay valid; the admin's edits to
  //     that step's approver/condition/etc. land in place)
  //   - INSERT rows whose step_index is new
  //   - Try to DELETE rows whose step_index disappeared. If any are still
  //     referenced by an in-flight approval, surface a clear 409 instead of
  //     PostgREST's raw FK error.
  if (body.steps) {
    const { data: existingRaw } = await supabase
      .from('approval_chain_steps')
      .select('id, step_index')
      .eq('chain_id', params.id)
    const existing = (existingRaw ?? []) as Array<{ id: string; step_index: number }>
    const existingByIndex = new Map(existing.map(r => [r.step_index, r.id]))
    const incomingIndexes = new Set(body.steps.map(s => s.step_index))

    // 1) Updates + inserts
    for (const s of body.steps) {
      const row = {
        chain_id:          params.id,
        step_index:        s.step_index,
        name:              s.name,
        step_type:         s.step_type,
        parallel_group_id: s.parallel_group_id ?? null,
        condition:         s.condition ?? null,
        approver_type:     s.approver_type,
        approver_value:    s.approver_value,
        min_approvals:     s.min_approvals,
        sla_hours:         s.sla_hours ?? null,
      }
      const existingId = existingByIndex.get(s.step_index)
      if (existingId) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await supabase.from('approval_chain_steps').update(row as any).eq('id', existingId)
        if (error) return handleSupabaseError(error)
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await supabase.from('approval_chain_steps').insert(row as any)
        if (error) return handleSupabaseError(error)
      }
    }

    // 2) Deletes for steps that the editor removed
    const toDelete = existing.filter(r => !incomingIndexes.has(r.step_index)).map(r => r.id)
    if (toDelete.length > 0) {
      const { error: delErr } = await supabase
        .from('approval_chain_steps')
        .delete()
        .in('id', toDelete)
      if (delErr) {
        // 23503 = foreign_key_violation — a removed step is still referenced
        // by an in-flight approval_step. Cancel/finish those approvals first,
        // or keep the step in the chain.
        if (delErr.code === '23503') {
          return NextResponse.json(
            {
              error:
                'Cannot remove a step that an in-flight approval is still using. ' +
                'Cancel or finish the open approvals on this chain, then try again.',
            },
            { status: 409 },
          )
        }
        return handleSupabaseError(delErr)
      }
    }
  }

  return NextResponse.json({ ok: true })
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth

  const supabase = createAdminClient()
  // Soft-deactivate to preserve historical references from approvals.
  const { error } = await supabase
    .from('approval_chains')
    .update({ is_active: false })
    .eq('id', params.id)
    .eq('org_id', auth.orgId)
  if (error) return handleSupabaseError(error)
  return NextResponse.json({ ok: true })
}
