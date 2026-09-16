// Database side of requisition edits after approval (Ashby model). Pure
// diff/gating logic lives in ./reapproval.ts. This module must NOT import the
// approvals engine (the engine imports it to apply/reject/cancel changes).

import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/server'
import { writeAudit } from '@/lib/approvals/audit'
import { logger } from '@/lib/logger'
import { DEFAULT_OPENING_REAPPROVAL_FIELDS, changesToPatch, mapsToChanges, type FieldChange } from './reapproval'

// openings/jobs columns added after the generated types; cast like the rest of the module.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = any

export type OpeningChangeRequest = {
  id: string; org_id: string; opening_id: string
  previous: Record<string, unknown>; proposed: Record<string, unknown>
  status: 'pending' | 'approved' | 'rejected' | 'cancelled'
  approval_id: string | null; requested_by: string; note: string | null
  decided_at: string | null; created_at: string; updated_at: string
}

/** Gated field set for an org: built-ins from org_settings ∪ flagged custom fields. */
export async function loadGatedFields(supabase: SupabaseClient, orgId: string): Promise<Set<string>> {
  const sb = supabase as unknown as Loose
  const gated = new Set<string>()
  const settings = await sb.from('org_settings').select('opening_reapproval_fields').eq('org_id', orgId).maybeSingle()
  const cfg = settings.error ? null : settings.data?.opening_reapproval_fields
  for (const f of (Array.isArray(cfg) ? cfg : DEFAULT_OPENING_REAPPROVAL_FIELDS) as string[]) gated.add(f)
  const defs = await sb.from('custom_field_definitions').select('field_key')
    .eq('org_id', orgId).eq('object_type', 'opening').eq('is_active', true).eq('require_reapproval', true)
  for (const d of (defs.error ? [] : defs.data ?? []) as Array<{ field_key: string }>) gated.add(`custom_fields.${d.field_key}`)
  return gated
}

export async function getPendingChange(supabase: SupabaseClient, orgId: string, openingId: string): Promise<OpeningChangeRequest | null> {
  const sb = supabase as unknown as Loose
  const { data, error } = await sb.from('opening_change_requests').select('*')
    .eq('org_id', orgId).eq('opening_id', openingId).eq('status', 'pending').maybeSingle()
  return error ? null : (data as OpeningChangeRequest | null)
}

/** Out-of-band = comp range falls outside the linked band. */
async function computeOutOfBand(supabase: SupabaseClient, orgId: string, row: Record<string, unknown>): Promise<boolean | null> {
  const bandId = row.comp_band_id as string | null
  const min = row.comp_min as number | string | null, max = row.comp_max as number | string | null
  if (!bandId || (min === null && max === null)) return null
  const { data: band } = await supabase.from('compensation_bands').select('min_salary, max_salary').eq('id', bandId).eq('org_id', orgId).maybeSingle()
  if (!band) return null
  const b = band as { min_salary: number; max_salary: number }
  return (min !== null && Number(min) < b.min_salary) || (max !== null && Number(max) > b.max_salary)
}

/** Append a numbered snapshot of the opening as it is NOW. */
export async function writeOpeningVersion(
  supabase: SupabaseClient, orgId: string, openingId: string,
  reason: 'approved' | 'edited' | 'change_applied', changedFields: string[], createdBy: string | null, changeRequestId: string | null = null,
): Promise<number | null> {
  const sb = supabase as unknown as Loose
  try {
    const [{ data: row }, { data: last }] = await Promise.all([
      sb.from('openings').select('*').eq('id', openingId).eq('org_id', orgId).maybeSingle(),
      sb.from('opening_versions').select('version_no').eq('opening_id', openingId).order('version_no', { ascending: false }).limit(1).maybeSingle(),
    ])
    if (!row) return null
    const version_no = ((last as { version_no: number } | null)?.version_no ?? 0) + 1
    const { error } = await sb.from('opening_versions').insert({
      org_id: orgId, opening_id: openingId, version_no, reason, snapshot: row, changed_fields: changedFields,
      change_request_id: changeRequestId, created_by: createdBy,
    })
    if (error) { logger.warn('[openings] version write failed', { openingId, error: error.message }); return null }
    return version_no
  } catch (e) { logger.warn('[openings] version write threw', { openingId, e }); return null }
}

/** Keep every linked job's hiring manager in step with the requisition. */
export async function propagateHiringManagerToJobs(
  supabase: SupabaseClient, orgId: string, openingId: string,
  hm: { user_id: string | null; name: string | null; email: string | null },
): Promise<number> {
  const sb = supabase as unknown as Loose
  const { data: links } = await sb.from('job_openings').select('job_id').eq('opening_id', openingId)
  const jobIds = ((links ?? []) as Array<{ job_id: string }>).map(l => l.job_id)
  if (!jobIds.length) return 0
  const { data: jobs } = await sb.from('jobs').select('id, custom_fields').eq('org_id', orgId).in('id', jobIds)
  let n = 0
  for (const j of (jobs ?? []) as Array<{ id: string; custom_fields: Record<string, unknown> | null }>) {
    const cf = { ...(j.custom_fields ?? {}) } as Record<string, unknown>
    if (hm.name)  cf.hiring_manager_name  = hm.name;  else delete cf.hiring_manager_name
    if (hm.email) cf.hiring_manager_email = hm.email; else delete cf.hiring_manager_email
    const { error } = await sb.from('jobs').update({ hiring_manager_user_id: hm.user_id, custom_fields: cf }).eq('id', j.id).eq('org_id', orgId)
    if (!error) n++
  }
  return n
}

/**
 * Apply a patch to an opening: sync HM name/email from the user when the HM
 * account changes, recompute out_of_band, write the row, append a version,
 * and push a changed hiring manager down to linked jobs. Returns the new row.
 */
export async function applyOpeningPatch(
  supabase: SupabaseClient, orgId: string, openingId: string, patch: Record<string, unknown>,
  opts: { actorUserId: string | null; reason: 'edited' | 'change_applied'; changeRequestId?: string | null; changedFields: string[] },
): Promise<Record<string, unknown>> {
  const sb = supabase as unknown as Loose
  const { data: current } = await sb.from('openings').select('*').eq('id', openingId).eq('org_id', orgId).single()
  const cur = current as Record<string, unknown>
  const next: Record<string, unknown> = { ...patch }

  const hmChanged = 'hiring_manager_id' in next && next.hiring_manager_id !== cur.hiring_manager_id
  if (hmChanged && next.hiring_manager_id && !('hiring_manager_name' in next) && !('hiring_manager_email' in next)) {
    const { data: u } = await sb.from('users').select('full_name, first_name, last_name, email').eq('id', next.hiring_manager_id).maybeSingle()
    if (u) {
      next.hiring_manager_name  = u.full_name || [u.first_name, u.last_name].filter(Boolean).join(' ') || u.email || null
      next.hiring_manager_email = u.email ?? null
    }
  }

  const merged = { ...cur, ...next }
  if ('comp_min' in next || 'comp_max' in next || 'comp_band_id' in next) {
    const oob = await computeOutOfBand(supabase, orgId, merged)
    if (oob !== null) next.out_of_band = oob
  }

  const { data: updated, error } = await sb.from('openings').update(next).eq('id', openingId).eq('org_id', orgId).select().single()
  if (error) throw error
  const row = updated as Record<string, unknown>

  await writeOpeningVersion(supabase, orgId, openingId, opts.reason, opts.changedFields, opts.actorUserId, opts.changeRequestId ?? null)

  if (hmChanged || 'hiring_manager_name' in next || 'hiring_manager_email' in next) {
    await propagateHiringManagerToJobs(supabase, orgId, openingId, {
      user_id: (row.hiring_manager_id as string | null) ?? null,
      name: (row.hiring_manager_name as string | null) ?? null,
      email: (row.hiring_manager_email as string | null) ?? null,
    })
  }
  return row
}

// ── Engine hooks (approval instance target_type = 'opening_change') ──

async function loadChange(changeRequestId: string): Promise<OpeningChangeRequest | null> {
  const sb = createAdminClient() as unknown as Loose
  const { data } = await sb.from('opening_change_requests').select('*').eq('id', changeRequestId).maybeSingle()
  return (data as OpeningChangeRequest | null) ?? null
}

/** Approval completed → write the proposed values onto the opening. */
export async function applyOpeningChange(changeRequestId: string): Promise<void> {
  const cr = await loadChange(changeRequestId)
  if (!cr || cr.status !== 'pending') return
  const supabase = createAdminClient()
  const sb = supabase as unknown as Loose
  const { data: current } = await sb.from('openings').select('*').eq('id', cr.opening_id).maybeSingle()
  if (!current) return
  const changes: FieldChange[] = mapsToChanges(cr.previous, cr.proposed)
  const patch = changesToPatch(changes, current as Record<string, unknown>)
  await applyOpeningPatch(supabase, cr.org_id, cr.opening_id, patch, {
    actorUserId: cr.requested_by, reason: 'change_applied', changeRequestId: cr.id, changedFields: changes.map(c => c.field),
  })
  await sb.from('opening_change_requests').update({ status: 'approved', decided_at: new Date().toISOString() }).eq('id', cr.id)
  await writeAudit({
    org_id: cr.org_id, approval_id: cr.approval_id, target_type: 'opening', target_id: cr.opening_id,
    actor_user_id: null, action: 'change_applied', from_state: 'pending', to_state: 'applied',
    metadata: { change_request_id: cr.id, fields: changes.map(c => c.field) },
  })
}

export async function rejectOpeningChange(changeRequestId: string): Promise<void> {
  const cr = await loadChange(changeRequestId)
  if (!cr || cr.status !== 'pending') return
  const sb = createAdminClient() as unknown as Loose
  await sb.from('opening_change_requests').update({ status: 'rejected', decided_at: new Date().toISOString() }).eq('id', cr.id)
  await writeAudit({
    org_id: cr.org_id, approval_id: cr.approval_id, target_type: 'opening', target_id: cr.opening_id,
    actor_user_id: null, action: 'change_rejected', from_state: 'pending', to_state: 'rejected',
    metadata: { change_request_id: cr.id, fields: Object.keys(cr.proposed) },
  })
}

export async function cancelOpeningChange(changeRequestId: string, actorUserId: string | null = null): Promise<void> {
  const cr = await loadChange(changeRequestId)
  if (!cr || cr.status !== 'pending') return
  const sb = createAdminClient() as unknown as Loose
  await sb.from('opening_change_requests').update({ status: 'cancelled', decided_at: new Date().toISOString() }).eq('id', cr.id)
  await writeAudit({
    org_id: cr.org_id, approval_id: cr.approval_id, target_type: 'opening', target_id: cr.opening_id,
    actor_user_id: actorUserId, action: 'change_cancelled', from_state: 'pending', to_state: 'cancelled',
    metadata: { change_request_id: cr.id, fields: Object.keys(cr.proposed) },
  })
}

/** For notifications / inbox: the opening behind a change request. */
export async function openingForChange(changeRequestId: string): Promise<{ id: string; title: string } | null> {
  const sb = createAdminClient() as unknown as Loose
  const { data: cr } = await sb.from('opening_change_requests').select('opening_id').eq('id', changeRequestId).maybeSingle()
  if (!cr) return null
  const { data: o } = await sb.from('openings').select('id, title').eq('id', cr.opening_id).maybeSingle()
  return (o as { id: string; title: string } | null) ?? null
}

/** Engine hook: the requisition itself was just approved → snapshot it as a version. */
export async function recordApprovedVersion(openingId: string): Promise<void> {
  const supabase = createAdminClient()
  const { data } = await (supabase as unknown as Loose).from('openings').select('org_id').eq('id', openingId).maybeSingle()
  if (!data) return
  await writeOpeningVersion(supabase, data.org_id as string, openingId, 'approved', [], null)
}
