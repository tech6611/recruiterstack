// Seat lifecycle for requisitions (openings) — Phase 2 "close the loop".
//   publish job  → linked approved seats become open
//   hire         → one open seat on that job becomes filled
//   withdraw job → its open, unfilled seats fall back to approved
//   close        → a seat / job closes with a reason
// Every transition writes an approval_audit_log row on the entity.

import type { SupabaseClient } from '@supabase/supabase-js'
import { writeAudit } from '@/lib/approvals/audit'
import { logger } from '@/lib/logger'
import { summarizeSeats, pickSeatToFill, type SeatSummary, type JobCloseReason, type OpeningCloseReason } from './seat-math'
export { summarizeSeats, pickSeatToFill, JOB_CLOSE_REASONS, OPENING_CLOSE_REASONS } from './seat-math'
export type { SeatSummary, JobCloseReason, OpeningCloseReason } from './seat-math'

// Columns from migration 141 aren't in the generated types.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = any

/** Update that tolerates migration 141 not being applied yet (drops unknown columns). */
async function updateTolerant(sb: Loose, table: string, patch: Record<string, unknown>, id: string): Promise<boolean> {
  const { error } = await sb.from(table).update(patch).eq('id', id)
  if (!error) return true
  if (error.code === '42703') {
    const minimal = 'status' in patch ? { status: patch.status } : null
    if (!minimal) return false
    const { error: e2 } = await sb.from(table).update(minimal).eq('id', id)
    return !e2
  }
  logger.warn('[seats] update failed', { table, id, error: error.message })
  return false
}

async function linkedSeats(sb: Loose, jobId: string): Promise<Array<{ id: string; status: string; linked_at: string; org_id: string }>> {
  const { data: links } = await sb.from('job_openings').select('opening_id, linked_at').eq('job_id', jobId)
  const ids = ((links ?? []) as Array<{ opening_id: string }>).map(l => l.opening_id)
  if (!ids.length) return []
  const linkedAt = new Map(((links ?? []) as Array<{ opening_id: string; linked_at: string }>).map(l => [l.opening_id, l.linked_at]))
  const { data: rows } = await sb.from('openings').select('id, status, org_id').in('id', ids)
  return ((rows ?? []) as Array<{ id: string; status: string; org_id: string }>).map(r => ({ ...r, linked_at: linkedAt.get(r.id) ?? '' }))
}

/** Job published → every linked approved seat opens. */
export async function openSeatsForJob(supabase: SupabaseClient, orgId: string, jobId: string, actorUserId: string | null): Promise<number> {
  const sb = supabase as unknown as Loose
  let n = 0
  for (const s of await linkedSeats(sb, jobId)) {
    if (s.status !== 'approved') continue
    if (await updateTolerant(sb, 'openings', { status: 'open', opened_at: new Date().toISOString() }, s.id)) {
      n++
      await writeAudit({ org_id: orgId, target_type: 'opening', target_id: s.id, actor_user_id: actorUserId, action: 'opened', from_state: 'approved', to_state: 'open', metadata: { job_id: jobId } })
    }
  }
  return n
}

/** Job withdrawn → open, unfilled seats fall back to approved (the headcount survives). */
export async function releaseSeatsForJob(supabase: SupabaseClient, orgId: string, jobId: string, actorUserId: string | null): Promise<number> {
  const sb = supabase as unknown as Loose
  let n = 0
  for (const s of await linkedSeats(sb, jobId)) {
    if (s.status !== 'open') continue
    if (await updateTolerant(sb, 'openings', { status: 'approved', opened_at: null }, s.id)) {
      n++
      await writeAudit({ org_id: orgId, target_type: 'opening', target_id: s.id, actor_user_id: actorUserId, action: 'released', from_state: 'open', to_state: 'approved', metadata: { job_id: jobId } })
    }
  }
  return n
}

/** Seat counts for a job (for headers, the board, and the "all filled" prompt). */
export async function seatSummaryForJob(supabase: SupabaseClient, jobId: string): Promise<SeatSummary> {
  const seats = await linkedSeats(supabase as unknown as Loose, jobId)
  return summarizeSeats(seats.map(s => s.status))
}

/**
 * A candidate was hired → fill one seat on their job. Idempotent per application
 * (a seat already filled by this application is left alone). Returns the seat
 * filled (if any) and whether the job now has no seats left.
 */
export async function recordHire(
  supabase: SupabaseClient, orgId: string, applicationId: string, actorUserId: string | null,
): Promise<{ opening_id: string | null; summary: SeatSummary; job_id: string | null; job_full: boolean }> {
  const sb = supabase as unknown as Loose
  const empty = { opening_id: null, summary: summarizeSeats([]), job_id: null, job_full: false }
  const { data: app } = await sb.from('applications').select('id, job_id, candidate_id').eq('id', applicationId).eq('org_id', orgId).maybeSingle()
  if (!app?.job_id) return empty

  const seats = await linkedSeats(sb, app.job_id)
  // Already recorded for this application?
  const { data: already } = await sb.from('openings').select('id').eq('filled_by_application_id', applicationId).maybeSingle().then((r: Loose) => r.error ? { data: null } : r)
  let openingId: string | null = already?.id ?? null
  if (!openingId) {
    openingId = pickSeatToFill(seats)
    if (openingId) {
      const before = seats.find(s => s.id === openingId)?.status ?? 'open'
      const ok = await updateTolerant(sb, 'openings', {
        status: 'filled', filled_at: new Date().toISOString(), filled_by_application_id: applicationId,
      }, openingId)
      if (ok) {
        await writeAudit({ org_id: orgId, target_type: 'opening', target_id: openingId, actor_user_id: actorUserId, action: 'filled', from_state: before, to_state: 'filled', metadata: { job_id: app.job_id, application_id: applicationId, candidate_id: app.candidate_id } })
        // Stamp the seat on the candidate's offer(s) for that application, if any.
        await sb.from('offers').update({ opening_id: openingId }).eq('application_id', applicationId).eq('org_id', orgId).then(() => undefined, () => undefined)
      } else {
        openingId = null
      }
    }
  }
  const summary = await seatSummaryForJob(supabase, app.job_id)
  return { opening_id: openingId, summary, job_id: app.job_id, job_full: summary.total > 0 && summary.remaining === 0 }
}

/** Close a seat without a hire. */
export async function closeOpening(
  supabase: SupabaseClient, orgId: string, openingId: string, reason: OpeningCloseReason, note: string | null, actorUserId: string,
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const sb = supabase as unknown as Loose
  const { data: o } = await sb.from('openings').select('id, status').eq('id', openingId).eq('org_id', orgId).maybeSingle()
  if (!o) return { ok: false, error: 'Opening not found', status: 404 }
  if (!['approved', 'open', 'draft', 'pending_approval'].includes(o.status)) return { ok: false, error: `A ${o.status} requisition can't be closed.`, status: 409 }
  const ok = await updateTolerant(sb, 'openings', { status: 'closed', closed_at: new Date().toISOString(), close_reason: reason, close_note: note }, openingId)
  if (!ok) return { ok: false, error: 'Could not close the requisition.', status: 500 }
  await writeAudit({ org_id: orgId, target_type: 'opening', target_id: openingId, actor_user_id: actorUserId, action: 'closed', from_state: o.status, to_state: 'closed', metadata: { reason, note } })
  return { ok: true }
}

/** Close a job with a reason: postings come down, seats stay as they are (filled stays filled; open seats close). */
export async function closeJob(
  supabase: SupabaseClient, orgId: string, jobId: string, reason: JobCloseReason, note: string | null, actorUserId: string,
  opts: { closeOpenSeats: boolean },
): Promise<{ ok: true; seats_closed: number } | { ok: false; error: string; status: number }> {
  const sb = supabase as unknown as Loose
  const { data: j } = await sb.from('jobs').select('id, status').eq('id', jobId).eq('org_id', orgId).maybeSingle()
  if (!j) return { ok: false, error: 'Job not found', status: 404 }
  if (!['open', 'paused', 'approved'].includes(j.status)) return { ok: false, error: `Only an open, paused or approved job can be closed. Current status: '${j.status}'.`, status: 409 }
  const ok = await updateTolerant(sb, 'jobs', { status: 'closed', closed_at: new Date().toISOString(), close_reason: reason, close_note: note, apply_token: null }, jobId)
  if (!ok) return { ok: false, error: 'Could not close the job.', status: 500 }
  await sb.from('job_postings').update({ is_live: false, unpublished_at: new Date().toISOString() }).eq('job_id', jobId).eq('is_live', true)
  await writeAudit({ org_id: orgId, target_type: 'job', target_id: jobId, actor_user_id: actorUserId, action: 'closed', from_state: j.status, to_state: 'closed', metadata: { reason, note } })
  let seatsClosed = 0
  if (opts.closeOpenSeats) {
    for (const s of await linkedSeats(sb, jobId)) {
      if (s.status !== 'open' && s.status !== 'approved') continue
      const r = await closeOpening(supabase, orgId, s.id, reason === 'filled' ? 'filled_elsewhere' : (reason as OpeningCloseReason), note, actorUserId)
      if (r.ok) seatsClosed++
    }
  }
  return { ok: true, seats_closed: seatsClosed }
}

/** Archive ↔ unarchive with the prior status remembered. */
export async function archiveEntity(supabase: SupabaseClient, orgId: string, table: 'jobs' | 'openings', id: string, actorUserId: string): Promise<boolean> {
  const sb = supabase as unknown as Loose
  const { data: row } = await sb.from(table).select('id, status').eq('id', id).eq('org_id', orgId).maybeSingle()
  if (!row || row.status === 'archived') return !!row
  const ok = await updateTolerant(sb, table, { status: 'archived', status_before_archive: row.status }, id)
  if (ok) await writeAudit({ org_id: orgId, target_type: table === 'jobs' ? 'job' : 'opening', target_id: id, actor_user_id: actorUserId, action: 'archived', from_state: row.status, to_state: 'archived' })
  return ok
}
export async function unarchiveEntity(supabase: SupabaseClient, orgId: string, table: 'jobs' | 'openings', id: string, actorUserId: string): Promise<{ ok: boolean; status: string | null }> {
  const sb = supabase as unknown as Loose
  const { data: row, error } = await sb.from(table).select('id, status, status_before_archive').eq('id', id).eq('org_id', orgId).maybeSingle()
  const r = error ? (await sb.from(table).select('id, status').eq('id', id).eq('org_id', orgId).maybeSingle()).data : row
  if (!r) return { ok: false, status: null }
  if (r.status !== 'archived') return { ok: true, status: r.status }
  // Back to where it was; a job that was live comes back paused (its link is gone), never straight to open.
  let next: string = r.status_before_archive ?? (table === 'jobs' ? 'closed' : 'draft')
  if (table === 'jobs' && next === 'open') next = 'paused'
  const ok = await updateTolerant(sb, table, { status: next, status_before_archive: null }, id)
  if (ok) await writeAudit({ org_id: orgId, target_type: table === 'jobs' ? 'job' : 'opening', target_id: id, actor_user_id: actorUserId, action: 'unarchived', from_state: 'archived', to_state: next })
  return { ok, status: ok ? next : null }
}

/** Plain status-change audit row for job routes that only emitted webhooks before. */
export async function auditJobStatus(orgId: string, jobId: string, actorUserId: string | null, action: string, from: string, to: string, metadata: Record<string, unknown> = {}): Promise<void> {
  await writeAudit({ org_id: orgId, target_type: 'job', target_id: jobId, actor_user_id: actorUserId, action, from_state: from, to_state: to, metadata })
}
