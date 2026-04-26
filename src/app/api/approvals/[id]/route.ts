import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireOrgAndUser } from '@/lib/auth'

// GET /api/approvals/:id — full approval state including steps + chain step metadata.
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireOrgAndUser()
  if (auth instanceof NextResponse) return auth
  const { orgId } = auth

  const supabase = createAdminClient()
  const { data: approvalRaw, error } = await supabase
    .from('approvals')
    .select('*')
    .eq('id', params.id)
    .eq('org_id', orgId)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!approvalRaw) return NextResponse.json({ error: 'Approval not found' }, { status: 404 })

  const { data: stepsRaw } = await supabase
    .from('approval_steps')
    .select('*')
    .eq('approval_id', params.id)
    .order('step_index', { ascending: true })

  // Pull chain step metadata (name, approver_type) for display.
  const chainStepIds = (stepsRaw ?? []).map(s => (s as { chain_step_id: string }).chain_step_id)
  const { data: chainStepsRaw } = chainStepIds.length > 0
    ? await supabase.from('approval_chain_steps').select('id, name, approver_type, sla_hours').in('id', chainStepIds)
    : { data: [] }

  // Pull approver user profiles for display.
  const allApproverIds = new Set<string>()
  for (const s of (stepsRaw ?? []) as Array<{ approvers: Array<{ user_id: string }> }>) {
    for (const a of s.approvers ?? []) allApproverIds.add(a.user_id)
  }
  const { data: approverUsers } = allApproverIds.size > 0
    ? await supabase.from('users').select('id, full_name, email').in('id', Array.from(allApproverIds))
    : { data: [] }

  return NextResponse.json({
    data: {
      approval:    approvalRaw,
      steps:       stepsRaw ?? [],
      chain_steps: chainStepsRaw ?? [],
      approvers:   approverUsers ?? [],
    },
  })
}
