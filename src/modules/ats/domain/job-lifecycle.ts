import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'
import { submitForApproval, ApprovalError } from '@/lib/approvals/engine'
import { emitWebhook } from '@/lib/webhooks/emit'
import { logger } from '@/lib/logger'
import type { JobIntakeCreateInput } from '@/lib/validations/jobs'

/**
 * Canonical job lifecycle facade. Single source of truth for the job creation
 * and status-transition logic shared by the /api/req-jobs/* routes and the
 * copilot job tools. Keeping it here (not inline in the routes) means the
 * chatbot and the website enforce the exact same guards and cascades.
 */

type Supabase = SupabaseClient<Database>

/** Business-logic result for a transition. `code` mirrors the HTTP status the
 *  route returns (200 ok / 404 / 409 / 422 / 500) so both surfaces agree. */
export type JobActionResult =
  | { ok: true; status: string; approvalId?: string }
  | { ok: false; error: string; code: number }

export type CreateJobResult =
  | { ok: true; job: Record<string, unknown> }
  | { ok: false; error: string; code: number }

/** Find an org-scoped department by name, creating it if absent. */
export async function findOrCreateDepartment(
  supabase: Supabase,
  orgId: string,
  name: string,
): Promise<string | null> {
  const trimmed = name.trim()
  if (!trimmed) return null
  const { data: existing } = await supabase
    .from('departments')
    .select('id')
    .eq('org_id', orgId)
    .eq('name', trimmed)
    .maybeSingle()
  if (existing) return (existing as { id: string }).id
  const { data: created } = await supabase
    .from('departments')
    .insert({ org_id: orgId, name: trimmed })
    .select('id')
    .single()
  return created ? (created as { id: string }).id : null
}

async function fetchJobStatus(
  supabase: Supabase,
  orgId: string,
  jobId: string,
): Promise<{ id: string; status: string } | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any)
    .from('jobs')
    .select('id, status')
    .eq('id', jobId)
    .eq('org_id', orgId)
    .maybeSingle()
  return (data ?? null) as { id: string; status: string } | null
}

/** Unpublish any live job-board postings (pause/withdraw cascade). Best-effort. */
async function unpublishLivePostings(supabase: Supabase, jobId: string, context: string): Promise<void> {
  const { error } = await supabase
    .from('job_postings')
    .update({ is_live: false, unpublished_at: new Date().toISOString() })
    .eq('job_id', jobId)
    .eq('is_live', true)
  if (error) logger.error(`[${context}] failed to unpublish postings`, error)
}

/**
 * Create a draft job from an APPROVED requisition (opening). Mirrors
 * POST /api/req-jobs: a job can only exist against an approved opening, so a
 * missing/unapproved link is refused (422). `input` is the Zod-validated
 * jobIntakeCreateSchema output.
 */
export async function createJobFromApprovedOpening(
  supabase: Supabase,
  orgId: string,
  userId: string,
  input: JobIntakeCreateInput,
): Promise<CreateJobResult> {
  if (!input.link_opening_id) {
    return { ok: false, code: 422, error: 'A job can only be created from an approved requisition. Pick an approved requisition first.' }
  }

  const { data: linkedOpening } = await supabase
    .from('openings')
    .select('id, status')
    .eq('id', input.link_opening_id)
    .eq('org_id', orgId)
    .maybeSingle()
  if (!linkedOpening) return { ok: false, code: 404, error: 'Requisition not found.' }
  if ((linkedOpening as { status: string }).status !== 'approved') {
    return { ok: false, code: 422, error: 'That requisition is not approved yet. A job can only be created from an approved requisition.' }
  }

  const departmentId = await findOrCreateDepartment(supabase, orgId, input.department)

  const { data: job, error } = await supabase
    .from('jobs')
    .insert({
      org_id:          orgId,
      title:           input.title,
      department_id:   departmentId,
      description:     input.description || null,
      confidentiality: input.confidentiality,
      custom_fields:   Object.keys(input.intake).length > 0 ? { intake: input.intake } : {},
      status:          'draft',
      created_by:      userId,
    })
    .select()
    .single()
  if (error) return { ok: false, code: 500, error: (error as { message: string }).message }
  const jobRow = job as { id: string }

  // Link the approved requisition to the new job; ignore a duplicate link (PK).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: linkErr } = await (supabase as any)
    .from('job_openings')
    .insert({ job_id: jobRow.id, opening_id: input.link_opening_id, linked_by: userId })
  if (linkErr && linkErr.code !== '23505') return { ok: false, code: 500, error: linkErr.message }

  return { ok: true, job: job as Record<string, unknown> }
}

/** Submit a draft job for approval (draft → pending_approval/approved). */
export async function submitJobForApproval(
  supabase: Supabase,
  orgId: string,
  userId: string,
  jobId: string,
): Promise<JobActionResult> {
  const { data: row, error } = await supabase
    .from('jobs')
    .select('*')
    .eq('id', jobId)
    .eq('org_id', orgId)
    .single()
  if (error || !row) return { ok: false, code: 404, error: 'Job not found' }
  const job = row as { id: string; status: string }
  if (job.status !== 'draft') {
    return { ok: false, code: 409, error: `Job is in '${job.status}', not 'draft'.` }
  }

  let result
  try {
    result = await submitForApproval({
      orgId, targetType: 'job', targetId: job.id,
      target: row as unknown as Record<string, unknown>,
      requesterId: userId,
    })
  } catch (err) {
    if (err instanceof ApprovalError) return { ok: false, code: err.status, error: err.message }
    throw err
  }

  const newStatus = result.status === 'approved' ? 'approved' : 'pending_approval'
  await supabase.from('jobs').update({ approval_id: result.approvalId, status: newStatus }).eq('id', job.id)
  return { ok: true, status: result.status, approvalId: result.approvalId }
}

/** Publish an approved job (first go-live: approved → open). Requires ≥ 1
 *  linked approved opening. Idempotent if already open. */
export async function publishJob(
  supabase: Supabase,
  orgId: string,
  jobId: string,
): Promise<JobActionResult> {
  const j = await fetchJobStatus(supabase, orgId, jobId)
  if (!j) return { ok: false, code: 404, error: 'Job not found' }
  if (j.status === 'open') return { ok: true, status: 'open' }
  if (j.status !== 'approved') {
    return { ok: false, code: 409, error: `Job must be 'approved' before publishing. Current status: '${j.status}'.` }
  }

  const { data: links } = await supabase.from('job_openings').select('opening_id').eq('job_id', jobId)
  const openingIds = (links ?? []).map(r => (r as { opening_id: string }).opening_id)
  const noLinkMsg = 'Need at least one approved Opening linked to this Job before publishing.'
  if (openingIds.length === 0) return { ok: false, code: 409, error: noLinkMsg }
  const { data: openings } = await supabase.from('openings').select('status').in('id', openingIds)
  const anyApproved = (openings ?? []).some(o =>
    ['approved', 'open', 'filled'].includes((o as { status: string }).status),
  )
  if (!anyApproved) return { ok: false, code: 409, error: noLinkMsg }

  const { error } = await supabase.from('jobs').update({ status: 'open' }).eq('id', jobId).eq('org_id', orgId)
  if (error) return { ok: false, code: 500, error: error.message }

  emitWebhook(orgId, 'job.published', { job_id: jobId }).catch(e => logger.error('[req-jobs publish] emit failed', e))
  return { ok: true, status: 'open' }
}

/** Pause a live job (open → paused) and unpublish live postings. Reversible
 *  via resume. Idempotent if already paused. */
export async function pauseJob(
  supabase: Supabase,
  orgId: string,
  jobId: string,
): Promise<JobActionResult> {
  const j = await fetchJobStatus(supabase, orgId, jobId)
  if (!j) return { ok: false, code: 404, error: 'Job not found' }
  if (j.status === 'paused') return { ok: true, status: 'paused' }
  if (j.status !== 'open') {
    return { ok: false, code: 409, error: `Only an open job can be paused. Current status: '${j.status}'.` }
  }

  const { error } = await supabase.from('jobs').update({ status: 'paused' }).eq('id', jobId).eq('org_id', orgId)
  if (error) return { ok: false, code: 500, error: error.message }

  await unpublishLivePostings(supabase, jobId, 'req-jobs pause')
  emitWebhook(orgId, 'job.paused', { job_id: jobId }).catch(e => logger.error('[req-jobs pause] emit failed', e))
  return { ok: true, status: 'paused' }
}

/** Resume a paused job (paused → open). Idempotent if already open. */
export async function resumeJob(
  supabase: Supabase,
  orgId: string,
  jobId: string,
): Promise<JobActionResult> {
  const j = await fetchJobStatus(supabase, orgId, jobId)
  if (!j) return { ok: false, code: 404, error: 'Job not found' }
  if (j.status === 'open') return { ok: true, status: 'open' }
  if (j.status !== 'paused') {
    return { ok: false, code: 409, error: `Only a paused job can be resumed. Current status: '${j.status}'.` }
  }

  const { error } = await supabase.from('jobs').update({ status: 'open' }).eq('id', jobId).eq('org_id', orgId)
  if (error) return { ok: false, code: 500, error: error.message }

  emitWebhook(orgId, 'job.resumed', { job_id: jobId }).catch(e => logger.error('[req-jobs resume] emit failed', e))
  return { ok: true, status: 'open' }
}

/** Withdraw a job (open/paused → withdrawn, TERMINAL). Clears apply_token and
 *  unpublishes live postings. Idempotent if already withdrawn. */
export async function withdrawJob(
  supabase: Supabase,
  orgId: string,
  jobId: string,
): Promise<JobActionResult> {
  const j = await fetchJobStatus(supabase, orgId, jobId)
  if (!j) return { ok: false, code: 404, error: 'Job not found' }
  if (j.status === 'withdrawn') return { ok: true, status: 'withdrawn' }
  if (j.status !== 'open' && j.status !== 'paused') {
    return { ok: false, code: 409, error: `Only an open or paused job can be withdrawn. Current status: '${j.status}'.` }
  }

  const { error } = await supabase
    .from('jobs')
    .update({ status: 'withdrawn', apply_token: null })
    .eq('id', jobId)
    .eq('org_id', orgId)
  if (error) return { ok: false, code: 500, error: error.message }

  await unpublishLivePostings(supabase, jobId, 'req-jobs withdraw')
  emitWebhook(orgId, 'job.withdrawn', { job_id: jobId }).catch(e => logger.error('[req-jobs withdraw] emit failed', e))
  return { ok: true, status: 'withdrawn' }
}
