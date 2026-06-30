import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'

/**
 * Read-side helpers for approvals, shared by the /api/approvals/* routes and the
 * copilot approval tools so both surfaces compute the same inbox/detail shape.
 */

type Supabase = SupabaseClient<Database>

const TYPE_LABEL: Record<string, string> = {
  opening: 'Requisition',
  job:     'Job posting',
  offer:   'Offer',
}

export interface PendingApprovalItem {
  approval_id: string
  step_id: string
  step_index: number
  target_type: string
  target_id: string
  target_title: string
  target_type_label: string
  requested_by_name: string | null
  activated_at: string
  due_at: string | null
}

/**
 * Pending approval steps awaiting THIS user's decision. A step qualifies iff the
 * approval + step are pending, the step is activated, the user is an approver,
 * and the user hasn't already decided. Targets (opening/job) are hydrated to
 * titles and requesters to names.
 */
export async function listPendingApprovalsForUser(
  supabase: Supabase,
  orgId: string,
  userId: string,
): Promise<PendingApprovalItem[]> {
  const { data: stepsRaw, error } = await supabase
    .from('approval_steps')
    .select('id, approval_id, step_index, approvers, decisions, activated_at, due_at')
    .eq('status', 'pending')
    .not('activated_at', 'is', null)
    .filter('approvers', 'cs', JSON.stringify([{ user_id: userId }]))
    .order('activated_at', { ascending: true })
  if (error) throw error

  const steps = (stepsRaw ?? []).filter(s => {
    const decisions = (s as { decisions: Array<{ user_id: string }> }).decisions ?? []
    return !decisions.some(d => d.user_id === userId)
  })
  if (steps.length === 0) return []

  const approvalIds = Array.from(new Set(steps.map(s => (s as { approval_id: string }).approval_id)))
  const { data: approvalsRaw } = await supabase
    .from('approvals')
    .select('id, target_type, target_id, requested_by, current_step_index')
    .eq('org_id', orgId)
    .in('id', approvalIds)
  const approvals = (approvalsRaw ?? []) as Array<{ id: string; target_type: string; target_id: string; requested_by: string; current_step_index: number }>
  const approvalMap = new Map(approvals.map(a => [a.id, a]))

  const openingIds = approvals.filter(a => a.target_type === 'opening').map(a => a.target_id)
  const jobIds     = approvals.filter(a => a.target_type === 'job').map(a => a.target_id)
  const [{ data: openingsRaw }, { data: jobsRaw }] = await Promise.all([
    openingIds.length ? supabase.from('openings').select('id, title').in('id', openingIds) : Promise.resolve({ data: [] }),
    jobIds.length     ? supabase.from('jobs').select('id, title').in('id', jobIds)         : Promise.resolve({ data: [] }),
  ])
  const titleById = new Map<string, string>()
  for (const o of (openingsRaw ?? [])) titleById.set((o as { id: string }).id, (o as { title: string }).title)
  for (const j of (jobsRaw ?? []))     titleById.set((j as { id: string }).id, (j as { title: string }).title)

  const requesterIds = Array.from(new Set(approvals.map(a => a.requested_by).filter(Boolean)))
  const { data: usersRaw } = requesterIds.length
    ? await supabase.from('users').select('id, full_name, email').in('id', requesterIds)
    : { data: [] }
  const requesterName = new Map(
    (usersRaw ?? []).map(u => {
      const row = u as { id: string; full_name: string | null; email: string | null }
      return [row.id, row.full_name || row.email || 'Unknown']
    }),
  )

  return steps
    .filter(s => approvalMap.has((s as { approval_id: string }).approval_id))
    .map(s => {
      const a = approvalMap.get((s as { approval_id: string }).approval_id)!
      const label = TYPE_LABEL[a.target_type] ?? a.target_type
      const title = titleById.get(a.target_id) ?? label
      return {
        approval_id:        a.id,
        step_id:            (s as { id: string }).id,
        step_index:         (s as { step_index: number }).step_index,
        target_type:        a.target_type,
        target_id:          a.target_id,
        target_title:       title,
        target_type_label:  label,
        requested_by_name:  requesterName.get(a.requested_by) ?? null,
        activated_at:       (s as { activated_at: string }).activated_at,
        due_at:             (s as { due_at: string | null }).due_at,
      }
    })
}

export interface ApprovalDetail {
  approval: Record<string, unknown>
  steps: Record<string, unknown>[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  chain_steps: any[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  approvers: any[]
}

/** Full approval state (approval + steps + chain-step metadata + approver
 *  profiles), or null if not found in the org. */
export async function getApprovalDetail(
  supabase: Supabase,
  orgId: string,
  approvalId: string,
): Promise<ApprovalDetail | null> {
  const { data: approvalRaw, error } = await supabase
    .from('approvals')
    .select('*')
    .eq('id', approvalId)
    .eq('org_id', orgId)
    .maybeSingle()
  if (error) throw error
  if (!approvalRaw) return null

  const { data: stepsRaw } = await supabase
    .from('approval_steps')
    .select('*')
    .eq('approval_id', approvalId)
    .order('step_index', { ascending: true })

  const chainStepIds = (stepsRaw ?? []).map(s => (s as { chain_step_id: string }).chain_step_id)
  const { data: chainStepsRaw } = chainStepIds.length > 0
    ? await supabase.from('approval_chain_steps').select('id, name, approver_type, sla_hours').in('id', chainStepIds)
    : { data: [] }

  const allApproverIds = new Set<string>()
  for (const s of (stepsRaw ?? []) as Array<{ approvers: Array<{ user_id: string }> }>) {
    for (const a of s.approvers ?? []) allApproverIds.add(a.user_id)
  }
  const { data: approverUsers } = allApproverIds.size > 0
    ? await supabase.from('users').select('id, full_name, email').in('id', Array.from(allApproverIds))
    : { data: [] }

  return {
    approval:    approvalRaw as Record<string, unknown>,
    steps:       (stepsRaw ?? []) as Record<string, unknown>[],
    chain_steps: chainStepsRaw ?? [],
    approvers:   approverUsers ?? [],
  }
}
