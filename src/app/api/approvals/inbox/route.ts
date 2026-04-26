import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireOrgAndUser } from '@/lib/auth'

/**
 * GET /api/approvals/inbox — pending steps for the current user.
 *
 * A step is in this inbox iff:
 *   - approvals.status = 'pending'
 *   - approval_steps.status = 'pending' AND activated_at IS NOT NULL
 *   - approvers (jsonb) contains an entry with this user_id
 *   - the user hasn't already decided
 *
 * We rely on Postgres' jsonb @> operator via .contains() in supabase-js.
 */
export async function GET() {
  const auth = await requireOrgAndUser()
  if (auth instanceof NextResponse) return auth
  const { orgId, userId } = auth

  const supabase = createAdminClient()
  const { data: stepsRaw, error } = await supabase
    .from('approval_steps')
    .select('id, approval_id, step_index, approvers, decisions, activated_at, due_at')
    .eq('status', 'pending')
    .not('activated_at', 'is', null)
    .contains('approvers', [{ user_id: userId }])
    .order('activated_at', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const steps = (stepsRaw ?? []).filter(s => {
    const decisions = (s as { decisions: Array<{ user_id: string }> }).decisions ?? []
    return !decisions.some(d => d.user_id === userId)
  })

  if (steps.length === 0) return NextResponse.json({ data: [] })

  // Filter to current user's org and join approval + target.
  const approvalIds = Array.from(new Set(steps.map(s => (s as { approval_id: string }).approval_id)))
  const { data: approvalsRaw } = await supabase
    .from('approvals')
    .select('id, target_type, target_id, requested_by, current_step_index')
    .eq('org_id', orgId)
    .in('id', approvalIds)
  const approvals = (approvalsRaw ?? []) as Array<{ id: string; target_type: string; target_id: string; requested_by: string; current_step_index: number }>
  const approvalMap = new Map(approvals.map(a => [a.id, a]))

  // Hydrate target titles + chain step name.
  const openingIds = approvals.filter(a => a.target_type === 'opening').map(a => a.target_id)
  const { data: openingsRaw } = openingIds.length
    ? await supabase.from('openings').select('id, title').in('id', openingIds)
    : { data: [] }
  const openingTitle = new Map((openingsRaw ?? []).map(o => [(o as { id: string }).id, (o as { title: string }).title]))

  const items = steps
    .filter(s => approvalMap.has((s as { approval_id: string }).approval_id))
    .map(s => {
      const a = approvalMap.get((s as { approval_id: string }).approval_id)!
      const title = a.target_type === 'opening' ? openingTitle.get(a.target_id) ?? 'Opening' : a.target_type
      return {
        approval_id:   a.id,
        step_id:       (s as { id: string }).id,
        step_index:    (s as { step_index: number }).step_index,
        target_type:   a.target_type,
        target_id:     a.target_id,
        target_title:  title,
        activated_at:  (s as { activated_at: string }).activated_at,
        due_at:        (s as { due_at: string | null }).due_at,
      }
    })

  return NextResponse.json({ data: items })
}
