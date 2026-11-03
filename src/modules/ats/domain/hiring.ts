/**
 * Hiring side-effects shared by the app routes and the copilot tools, so a hire
 * or an offer decision does the same bookkeeping wherever it's made:
 *
 *   - submitOfferForApproval — draft offer → the org's offer approval chain
 *     (POST /api/offers/:id/submit, copilot update_offer_status 'pending_approval')
 *   - applyOfferAccepted — candidate + application → hired, one job seat filled
 *     (PATCH /api/offers/:id, copilot update_offer_status 'accepted')
 *   - isHiredStage — landing in the Hired stage IS the hire (Ashby semantics)
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { submitForApproval, ApprovalError } from '@/lib/approvals/engine'
import { recordHire } from '@/lib/openings/seats'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = any

export function isHiredStage(stage: { name?: string | null; funnel_step?: string | null } | null | undefined): boolean {
  if (!stage) return false
  return stage.funnel_step === 'hired' || (stage.name ?? '').trim().toLowerCase() === 'hired'
}

export type SubmitOfferResult =
  | { ok: true; approval_id: string; status: string; auto_approved: boolean }
  | { ok: false; error: string; status: number }

/** Draft offer → approval engine. The engine's approve/reject branches keep
 *  the offer's status in sync as approvers decide. */
export async function submitOfferForApproval(
  supabase: SupabaseClient,
  orgId: string,
  offerId: string,
  userId: string,
): Promise<SubmitOfferResult> {
  const sb = supabase as Loose
  const { data: row, error } = await sb.from('offers').select('*').eq('id', offerId).eq('org_id', orgId).single()
  if (error || !row) return { ok: false, error: 'Offer not found', status: 404 }
  const offer = row as { id: string; status: string }
  if (offer.status !== 'draft') return { ok: false, error: `Offer is in '${offer.status}', not 'draft'.`, status: 409 }

  let result
  try {
    result = await submitForApproval({
      orgId,
      targetType:  'offer',
      targetId:    offer.id,
      target:      offer as unknown as Record<string, unknown>,
      requesterId: userId,
    })
  } catch (err) {
    if (err instanceof ApprovalError) return { ok: false, error: err.message, status: err.status }
    throw err
  }

  // If the engine auto-completed (single-requester chain), applyApprovedToTarget
  // already set status='approved' but doesn't know the approval_id — set both.
  const newStatus = result.status === 'approved' ? 'approved' : 'pending_approval'
  await sb.from('offers').update({ approval_id: result.approvalId, status: newStatus }).eq('id', offer.id)
  return { ok: true, approval_id: result.approvalId, status: result.status, auto_approved: result.autoApproved }
}

/** Offer accepted → candidate and application hired, one seat on the job filled
 *  (idempotent per application). Returns the seat result (null if none). */
export async function applyOfferAccepted(
  supabase: SupabaseClient,
  orgId: string,
  offer: { application_id: string; candidate_id: string },
  userId: string | null,
): Promise<Awaited<ReturnType<typeof recordHire>> | null> {
  const sb = supabase as Loose
  await sb.from('candidates').update({ status: 'hired', updated_at: new Date().toISOString() }).eq('id', offer.candidate_id).eq('org_id', orgId)
  await sb.from('applications').update({ status: 'hired' }).eq('id', offer.application_id).eq('org_id', orgId)
  return recordHire(supabase, orgId, offer.application_id, userId).catch(() => null)
}

/** Plain-English seat outcome for a hire, for copilot replies. */
export function seatNote(hire: Awaited<ReturnType<typeof recordHire>> | null): string {
  if (!hire || !hire.job_id) return ''
  if (!hire.opening_id) return ' No open seat was left on this job to fill — check the job\'s seats.'
  const s = hire.summary
  return hire.job_full
    ? ' One seat filled — that was the last open seat on this job.'
    : ` One seat filled (${s.remaining} of ${s.total} still open).`
}
