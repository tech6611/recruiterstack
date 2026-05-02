import Link from 'next/link'
import { redirect, notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { getOrgId } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'
import { ChainBuilder } from '@/components/approvals/ChainBuilder'
import type { ApprovalChain, ApprovalChainStep } from '@/lib/types/approvals'

type BuilderApproverType = 'user' | 'role' | 'hiring_team_member' | 'group'
type BuilderConditionOp  = 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains' | 'exists'

export default async function EditChainPage({ params }: { params: { id: string } }) {
  const orgId = await getOrgId()
  if (!orgId) redirect('/sign-in')

  const supabase = createAdminClient()
  const { data: chain } = await supabase
    .from('approval_chains')
    .select('*')
    .eq('id', params.id)
    .eq('org_id', orgId)
    .maybeSingle()

  if (!chain) notFound()
  const c = chain as ApprovalChain

  const { data: stepsRaw } = await supabase
    .from('approval_chain_steps')
    .select('*')
    .eq('chain_id', params.id)
    .order('step_index', { ascending: true })

  // Reconstruct "parallel with previous" from parallel_group_id values: any
  // step that shares a group_id with the immediately-previous step becomes
  // "parallel with previous" in the builder.
  const rawSteps = (stepsRaw ?? []) as ApprovalChainStep[]

  const steps = rawSteps.map((s, i) => {
    const v = s.approver_value as Record<string, unknown>
    const builderType: BuilderApproverType = s.approver_type
    const prev = i > 0 ? rawSteps[i - 1] : null
    const parallelWithPrev = !!(prev && s.parallel_group_id && s.parallel_group_id === prev.parallel_group_id)

    // Pull the simple (single-leaf) condition back out, if present and shaped like one.
    let cond_field: string | undefined
    let cond_op:    BuilderConditionOp | undefined
    let cond_val:   string | undefined
    if (s.condition && typeof s.condition === 'object' && 'field' in s.condition && 'op' in s.condition) {
      const leaf = s.condition as { field: string; op: BuilderConditionOp; value?: unknown }
      cond_field = leaf.field
      cond_op    = leaf.op
      if (leaf.op !== 'exists' && leaf.value !== undefined && leaf.value !== null) {
        cond_val = String(leaf.value)
      }
    }

    return {
      step_index:    s.step_index,
      name:          s.name,
      approver_type: builderType,
      approver_user_id:    typeof v.user_id  === 'string' ? v.user_id  : undefined,
      approver_role:       s.approver_type === 'role'              && typeof v.role     === 'string' ? v.role     : undefined,
      approver_team_role:  s.approver_type === 'hiring_team_member' && typeof v.role     === 'string' ? v.role     : undefined,
      approver_group_id:   s.approver_type === 'group'             && typeof v.group_id === 'string' ? v.group_id : undefined,
      min_approvals: s.min_approvals,
      sla_hours:     s.sla_hours ?? undefined,
      parallel_with_previous: parallelWithPrev,
      condition_field: cond_field,
      condition_op:    cond_op,
      condition_value: cond_val,
    }
  })

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <Link href="/admin/approvals" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900 mb-4">
        <ArrowLeft className="h-4 w-4" /> Back to chains
      </Link>
      <h1 className="text-2xl font-semibold text-slate-900">Edit chain</h1>
      <p className="text-sm text-slate-500 mt-1 mb-6">
        {c.is_active
          ? 'Edits to existing steps land in place; in-flight approvals keep running.'
          : 'This chain is archived. Restore it from the chains list to start using it again.'}
      </p>
      <ChainBuilder
        mode="edit"
        chainId={params.id}
        initial={{
          name:        c.name,
          description: c.description ?? '',
          target_type: c.target_type,
          is_active:   c.is_active,
          steps,
        }}
      />
    </div>
  )
}
