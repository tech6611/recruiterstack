import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireOrgAndUser } from '@/lib/auth'

/**
 * GET /api/audit-log?target_type=opening|job|offer&target_id=...
 *
 * Returns a chronological audit timeline for a target. For a JOB it also folds
 * in the history of the linked requisition(s) — because the job entity only
 * exists once the requisition is approved, so the job's own audit log would
 * otherwise start mid-story. Each row is tagged with the entity it belongs to
 * (`entity` / `entity_label`) so the UI can show "Requisition" vs "Job".
 *
 * Creation isn't written to `approval_audit_log`, so we synthesize a "created"
 * entry (actor = creator/requester) from `created_by` / `created_at`.
 *
 * Readable by admins + members (transparency, not access-controlled state).
 */

interface AuditRow {
  id:            string
  action:        string
  from_state:    string | null
  to_state:      string | null
  metadata:      Record<string, unknown>
  actor_user_id: string | null
  created_at:    string
  target_type:   string
  target_id:     string
  users:         { full_name: string | null; email: string } | null
  entity:        string
  entity_label:  string
}

const ENTITY_LABEL: Record<string, string> = { opening: 'Requisition', job: 'Job', offer: 'Offer' }

function syntheticCreated(entity: string, id: string, createdBy: string | null, createdAt: string): AuditRow {
  return {
    id: `created-${entity}-${id}`,
    action: 'created',
    from_state: null,
    to_state: 'draft',
    metadata: {},
    actor_user_id: createdBy ?? null,
    created_at: createdAt,
    target_type: entity,
    target_id: id,
    users: null,
    entity,
    entity_label: ENTITY_LABEL[entity] ?? entity,
  }
}

export async function GET(req: NextRequest) {
  const auth = await requireOrgAndUser()
  if (auth instanceof NextResponse) return auth
  const { orgId } = auth

  const targetType = req.nextUrl.searchParams.get('target_type')
  const targetId   = req.nextUrl.searchParams.get('target_id')
  if (!targetType || !targetId) {
    return NextResponse.json({ error: 'target_type and target_id are required' }, { status: 400 })
  }

  // Canonical tables (jobs/openings/job_openings) aren't all in the generated
  // types; mirror the `as any` casting used across the requisition domain.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any

  // For a job, gather its linked requisition(s) so we can prepend their history.
  const openingIds: string[] = []
  if (targetType === 'job') {
    const { data: links } = await supabase
      .from('job_openings')
      .select('opening_id')
      .eq('job_id', targetId)
    for (const l of (links ?? []) as Array<{ opening_id: string }>) openingIds.push(l.opening_id)
  }

  // target_id is a globally-unique UUID, so a single `.in()` safely fetches the
  // job's rows and its requisitions' rows without needing a target_type filter.
  const auditTargetIds = [targetId, ...openingIds]
  const { data: auditRaw, error } = await supabase
    .from('approval_audit_log')
    .select('id, action, from_state, to_state, metadata, actor_user_id, created_at, target_type, target_id, users:actor_user_id (full_name, email)')
    .eq('org_id', orgId)
    .in('target_id', auditTargetIds)
    .order('created_at', { ascending: false })
    .limit(400)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Synthesize "created" entries (creation isn't in approval_audit_log).
  const created: AuditRow[] = []
  const userIds = new Set<string>()

  // The requisition(s): always relevant on a job page; also the opening's own page.
  const openingIdsForCreate = targetType === 'opening' ? [targetId] : openingIds
  if (openingIdsForCreate.length > 0) {
    const { data: openings } = await supabase
      .from('openings')
      .select('id, created_by, created_at')
      .in('id', openingIdsForCreate)
    for (const o of (openings ?? []) as Array<{ id: string; created_by: string | null; created_at: string }>) {
      created.push(syntheticCreated('opening', o.id, o.created_by, o.created_at))
      if (o.created_by) userIds.add(o.created_by)
    }
  }

  // The job itself.
  if (targetType === 'job') {
    const { data: job } = await supabase
      .from('jobs')
      .select('id, created_by, created_at')
      .eq('id', targetId)
      .maybeSingle()
    const j = job as { id: string; created_by: string | null; created_at: string } | null
    if (j) {
      created.push(syntheticCreated('job', j.id, j.created_by, j.created_at))
      if (j.created_by) userIds.add(j.created_by)
    }
  }

  // Resolve actor names for the synthesized rows (audit rows already join users).
  if (userIds.size > 0) {
    const { data: us } = await supabase
      .from('users')
      .select('id, full_name, email')
      .in('id', Array.from(userIds))
    const byId = new Map<string, { full_name: string | null; email: string }>(
      (us ?? []).map((u: { id: string; full_name: string | null; email: string }) =>
        [u.id, { full_name: u.full_name, email: u.email }] as [string, { full_name: string | null; email: string }],
      ),
    )
    for (const c of created) if (c.actor_user_id) c.users = byId.get(c.actor_user_id) ?? null
  }

  // Tag the real audit rows with their entity label, merge with the synthesized
  // creations, and sort newest-first (matches the existing UI order).
  const tagged: AuditRow[] = ((auditRaw ?? []) as AuditRow[]).map(r => ({
    ...r,
    entity: r.target_type,
    entity_label: ENTITY_LABEL[r.target_type] ?? r.target_type,
  }))
  const all = [...tagged, ...created].sort((a, b) =>
    a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0,
  )

  return NextResponse.json({ data: all })
}
