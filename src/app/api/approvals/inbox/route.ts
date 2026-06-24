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
 * The jsonb @> filter is built via .filter('cs', JSON.stringify(...)) — using
 * supabase-js's .contains() with an array-of-objects encodes it as a Postgres
 * array literal ({[object Object]}) which Postgres rejects with
 * "invalid input syntax for type json". The string form is the only reliable
 * way to express jsonb @> for an array of objects via PostgREST.
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
    .filter('approvers', 'cs', JSON.stringify([{ user_id: userId }]))
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

  // Hydrate target titles — openings and jobs live in different tables.
  const openingIds = approvals.filter(a => a.target_type === 'opening').map(a => a.target_id)
  const jobIds     = approvals.filter(a => a.target_type === 'job').map(a => a.target_id)
  const [{ data: openingsRaw }, { data: jobsRaw }] = await Promise.all([
    openingIds.length ? supabase.from('openings').select('id, title').in('id', openingIds) : Promise.resolve({ data: [] }),
    jobIds.length     ? supabase.from('jobs').select('id, title').in('id', jobIds)         : Promise.resolve({ data: [] }),
  ])
  const titleById = new Map<string, string>()
  for (const o of (openingsRaw ?? [])) titleById.set((o as { id: string }).id, (o as { title: string }).title)
  for (const j of (jobsRaw ?? []))     titleById.set((j as { id: string }).id, (j as { title: string }).title)

  // Resolve requester names so the card can say who asked for the decision.
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

  // Human label for the kind of thing being approved.
  const TYPE_LABEL: Record<string, string> = {
    opening: 'Requisition',
    job:     'Job posting',
    offer:   'Offer',
  }

  const items = steps
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

  return NextResponse.json({ data: items })
}
