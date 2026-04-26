import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireOrgAndUser } from '@/lib/auth'
import { requireAdmin } from '@/lib/auth-admin'
import { parseBody, handleSupabaseError } from '@/lib/api/helpers'
import { chainCreateSchema } from '@/lib/validations/approval-chains'

// GET /api/admin/approval-chains — readable to any member; the form uses it.
export async function GET() {
  const auth = await requireOrgAndUser()
  if (auth instanceof NextResponse) return auth

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('approval_chains')
    .select('id, name, description, target_type, scope_conditions, is_active, created_at, updated_at')
    .eq('org_id', auth.orgId)
    .order('updated_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: data ?? [] })
}

// POST /api/admin/approval-chains — admin-only. Creates chain + its steps in one call.
export async function POST(req: NextRequest) {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth

  const body = await parseBody(req, chainCreateSchema)
  if (body instanceof NextResponse) return body

  const supabase = createAdminClient()
  const { data: chainRow, error: chainErr } = await supabase
    .from('approval_chains')
    .insert({
      org_id:           auth.orgId,
      name:             body.name,
      description:      body.description ?? null,
      target_type:      body.target_type,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      scope_conditions: (body.scope_conditions ?? null) as any,
      is_active:        body.is_active,
      created_by:       auth.userId,
    })
    .select()
    .single()
  if (chainErr || !chainRow) return handleSupabaseError(chainErr ?? new Error('insert failed'))
  const chain = chainRow as { id: string }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const stepsPayload: any[] = body.steps.map(s => ({
    chain_id:          chain.id,
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
  const { error: stepsErr } = await supabase.from('approval_chain_steps').insert(stepsPayload as any)
  if (stepsErr) return handleSupabaseError(stepsErr)

  return NextResponse.json({ data: chain }, { status: 201 })
}
