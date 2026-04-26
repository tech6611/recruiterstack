import Link from 'next/link'
import { auth } from '@clerk/nextjs/server'
import { redirect, notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/server'
import { ChainBuilder } from '@/components/approvals/ChainBuilder'
import type { ApprovalChain, ApprovalChainStep } from '@/lib/types/approvals'

// ChainBuilder UI only exposes these three types in Phase F (group lands later).
type BuilderApproverType = 'user' | 'role' | 'hiring_team_member'

export default async function EditChainPage({ params }: { params: { id: string } }) {
  const { orgId } = auth()
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

  const steps = ((stepsRaw ?? []) as ApprovalChainStep[]).map(s => {
    const v = s.approver_value as Record<string, unknown>
    // 'group' isn't editable in the F builder; show it as 'user' so the admin can re-pick.
    const builderType: BuilderApproverType = s.approver_type === 'group' ? 'user' : s.approver_type
    return {
      step_index:    s.step_index,
      name:          s.name,
      approver_type: builderType,
      approver_user_id:    typeof v.user_id === 'string' ? v.user_id : undefined,
      approver_role:       s.approver_type === 'role' && typeof v.role === 'string' ? v.role : undefined,
      approver_team_role:  s.approver_type === 'hiring_team_member' && typeof v.role === 'string' ? v.role : undefined,
      min_approvals: s.min_approvals,
      sla_hours:     s.sla_hours ?? undefined,
    }
  })

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <Link href="/admin/approvals" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900 mb-4">
        <ArrowLeft className="h-4 w-4" /> Back to chains
      </Link>
      <h1 className="text-2xl font-semibold text-slate-900">Edit chain</h1>
      <p className="text-sm text-slate-500 mt-1 mb-6">Editing replaces the existing steps wholesale.</p>
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
