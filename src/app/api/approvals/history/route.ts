import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireOrgAndUser } from '@/lib/auth'

/**
 * GET /api/approvals/history — approvals the current user has acted on.
 *
 * Personal, like the inbox: an approval shows up here once the user has
 * recorded a decision on any of its steps. We surface the overall approval
 * status (which may still be 'pending' if later steps remain) plus the user's
 * own decision so the History pane reads as "what I've decided."
 *
 * The jsonb @> filter on `decisions` uses .filter('cs', JSON.stringify(...))
 * for the same reason the inbox does on `approvers` — supabase-js's
 * .contains() encodes an array-of-objects as a Postgres array literal that
 * Postgres rejects; the string form is the reliable way to express jsonb @>.
 */

type Decision = { user_id: string; decision: 'approved' | 'rejected'; comment: string | null; at: string }

const TYPE_LABEL: Record<string, string> = {
  opening: 'Requisition',
  job:     'Job posting',
  offer:   'Offer',
}

export async function GET() {
  const auth = await requireOrgAndUser()
  if (auth instanceof NextResponse) return auth
  const { orgId, userId } = auth

  const supabase = createAdminClient()
  const { data: stepsRaw, error } = await supabase
    .from('approval_steps')
    .select('approval_id, decisions')
    .filter('decisions', 'cs', JSON.stringify([{ user_id: userId }]))
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // For each approval, keep the user's most recent decision.
  const myDecision = new Map<string, Decision>()
  for (const s of (stepsRaw ?? []) as Array<{ approval_id: string; decisions: Decision[] }>) {
    for (const d of (s.decisions ?? [])) {
      if (d.user_id !== userId) continue
      const prev = myDecision.get(s.approval_id)
      if (!prev || new Date(d.at).getTime() > new Date(prev.at).getTime()) {
        myDecision.set(s.approval_id, d)
      }
    }
  }

  const approvalIds = Array.from(myDecision.keys())
  if (approvalIds.length === 0) return NextResponse.json({ data: [] })

  // Scope to this org + pull display fields.
  const { data: approvalsRaw } = await supabase
    .from('approvals')
    .select('id, target_type, target_id, status, requested_by, created_at, completed_at')
    .eq('org_id', orgId)
    .in('id', approvalIds)
  const approvals = (approvalsRaw ?? []) as Array<{
    id: string; target_type: string; target_id: string; status: string
    requested_by: string; created_at: string; completed_at: string | null
  }>

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

  // Resolve requester names.
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

  const items = approvals.map(a => {
    const d = myDecision.get(a.id)!
    const label = TYPE_LABEL[a.target_type] ?? a.target_type
    return {
      approval_id:        a.id,
      target_type:        a.target_type,
      target_id:          a.target_id,
      target_title:       titleById.get(a.target_id) ?? label,
      target_type_label:  label,
      status:             a.status,
      requested_by_name:  requesterName.get(a.requested_by) ?? null,
      my_decision:        d.decision,
      my_decision_at:     d.at,
      created_at:         a.created_at,
      completed_at:       a.completed_at,
    }
  })

  // Newest decision first.
  items.sort((x, y) => new Date(y.my_decision_at).getTime() - new Date(x.my_decision_at).getTime())

  return NextResponse.json({ data: items })
}
