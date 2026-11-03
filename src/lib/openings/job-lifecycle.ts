/**
 * Job lifecycle transitions — the single implementation behind both the job
 * page buttons (POST /api/req-jobs/:id/{submit,publish,pause,resume}) and the
 * copilot's change_job_status tool. Close and unarchive live in ./seats
 * (closeJob, unarchiveEntity).
 *
 * Each returns { ok: true, status } or { ok: false, error, status } where the
 * error status is the HTTP code the routes respond with.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { openSeatsForJob, auditJobStatus } from '@/lib/openings/seats'
import { submitForApproval, ApprovalError } from '@/lib/approvals/engine'
import { emitWebhook } from '@/lib/webhooks/emit'
import { logger } from '@/lib/logger'

export type LifecycleResult =
  | { ok: true; status: string; approval_id?: string; seats_opened?: number }
  | { ok: false; error: string; status: number }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = any

async function loadJob(sb: Loose, orgId: string, jobId: string): Promise<{ id: string; status: string } | null> {
  const { data } = await sb.from('jobs').select('id, status').eq('id', jobId).eq('org_id', orgId).maybeSingle()
  return (data as { id: string; status: string } | null) ?? null
}

/** draft → pending_approval (or straight to approved when no chain applies). */
export async function submitJob(supabase: SupabaseClient, orgId: string, jobId: string, userId: string): Promise<LifecycleResult> {
  const sb = supabase as Loose
  const { data: row, error } = await sb.from('jobs').select('*').eq('id', jobId).eq('org_id', orgId).single()
  if (error || !row) return { ok: false, error: 'Job not found', status: 404 }
  const job = row as { id: string; status: string }
  if (job.status !== 'draft') return { ok: false, error: `Job is in '${job.status}', not 'draft'.`, status: 409 }

  let result
  try {
    result = await submitForApproval({
      orgId, targetType: 'job', targetId: job.id,
      target: row as unknown as Record<string, unknown>,
      requesterId: userId,
    })
  } catch (err) {
    if (err instanceof ApprovalError) return { ok: false, error: err.message, status: err.status }
    throw err
  }

  const newStatus = result.status === 'approved' ? 'approved' : 'pending_approval'
  await sb.from('jobs').update({ approval_id: result.approvalId, status: newStatus }).eq('id', job.id)
  return { ok: true, status: result.status, approval_id: result.approvalId }
}

/** approved → open (first go-live). Needs ≥1 approved linked opening; opens its seats. */
export async function publishJob(supabase: SupabaseClient, orgId: string, jobId: string, userId: string): Promise<LifecycleResult> {
  const sb = supabase as Loose
  const j = await loadJob(sb, orgId, jobId)
  if (!j) return { ok: false, error: 'Job not found', status: 404 }
  if (j.status === 'open') return { ok: true, status: 'open' }
  if (j.status !== 'approved') {
    return { ok: false, error: `Job must be 'approved' before publishing. Current status: '${j.status}'.`, status: 409 }
  }

  const { data: links } = await sb.from('job_openings').select('opening_id').eq('job_id', jobId)
  const openingIds = (links ?? []).map((r: { opening_id: string }) => r.opening_id)
  const noOpening = { ok: false as const, error: 'Need at least one approved Opening linked to this Job before publishing.', status: 409 }
  if (openingIds.length === 0) return noOpening
  const { data: openings } = await sb.from('openings').select('status').in('id', openingIds)
  const anyApproved = (openings ?? []).some((o: { status: string }) => ['approved', 'open', 'filled'].includes(o.status))
  if (!anyApproved) return noOpening

  const { error } = await sb.from('jobs').update({ status: 'open' }).eq('id', jobId).eq('org_id', orgId)
  if (error) return { ok: false, error: error.message, status: 500 }

  const opened = await openSeatsForJob(supabase, orgId, jobId, userId)
  await auditJobStatus(orgId, jobId, userId, 'published', j.status, 'open', { seats_opened: opened })
  emitWebhook(orgId, 'job.published', { job_id: jobId }).catch(e => logger.error('[job-lifecycle publish] emit failed', e))
  return { ok: true, status: 'open', seats_opened: opened }
}

/** open → paused. Stops applications; takes live job-board postings down. */
export async function pauseJob(supabase: SupabaseClient, orgId: string, jobId: string, userId: string): Promise<LifecycleResult> {
  const sb = supabase as Loose
  const j = await loadJob(sb, orgId, jobId)
  if (!j) return { ok: false, error: 'Job not found', status: 404 }
  if (j.status === 'paused') return { ok: true, status: 'paused' }
  if (j.status !== 'open') return { ok: false, error: `Only an open job can be paused. Current status: '${j.status}'.`, status: 409 }

  const { error } = await sb.from('jobs').update({ status: 'paused' }).eq('id', jobId).eq('org_id', orgId)
  if (error) return { ok: false, error: error.message, status: 500 }

  // Resume does NOT auto-relist postings (external boards can cost money) —
  // that stays an explicit action on the Postings tab.
  const { error: postingsError } = await sb
    .from('job_postings')
    .update({ is_live: false, unpublished_at: new Date().toISOString() })
    .eq('job_id', jobId)
    .eq('is_live', true)
  if (postingsError) logger.error('[job-lifecycle pause] failed to unpublish postings', postingsError)

  await auditJobStatus(orgId, jobId, userId, 'paused', 'open', 'paused')
  emitWebhook(orgId, 'job.paused', { job_id: jobId }).catch(e => logger.error('[job-lifecycle pause] emit failed', e))
  return { ok: true, status: 'paused' }
}

/** paused → open. The original apply link comes back; postings are not relisted. */
export async function resumeJob(supabase: SupabaseClient, orgId: string, jobId: string, userId: string): Promise<LifecycleResult> {
  const sb = supabase as Loose
  const j = await loadJob(sb, orgId, jobId)
  if (!j) return { ok: false, error: 'Job not found', status: 404 }
  if (j.status === 'open') return { ok: true, status: 'open' }
  if (j.status !== 'paused') return { ok: false, error: `Only a paused job can be resumed. Current status: '${j.status}'.`, status: 409 }

  const { error } = await sb.from('jobs').update({ status: 'open' }).eq('id', jobId).eq('org_id', orgId)
  if (error) return { ok: false, error: error.message, status: 500 }

  await auditJobStatus(orgId, jobId, userId, 'resumed', 'paused', 'open')
  emitWebhook(orgId, 'job.resumed', { job_id: jobId }).catch(e => logger.error('[job-lifecycle resume] emit failed', e))
  return { ok: true, status: 'open' }
}
