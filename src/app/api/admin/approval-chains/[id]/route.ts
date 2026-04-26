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

  // Steps replace-strategy: if provided, delete all existing chain_steps and insert new ones.
  // This is fine because chain_steps are template data; existing in-flight approvals already
  // reference their own chain_step_id with ON DELETE RESTRICT (DB will reject delete if any
  // approval still references one). For now the admin sees the error and decides.
  if (body.steps) {
    const { error: delErr } = await supabase.from('approval_chain_steps').delete().eq('chain_id', params.id)
    if (delErr) return handleSupabaseError(delErr)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stepsPayload: any[] = body.steps.map(s => ({
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
    }))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: insErr } = await supabase.from('approval_chain_steps').insert(stepsPayload as any)
    if (insErr) return handleSupabaseError(insErr)
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
