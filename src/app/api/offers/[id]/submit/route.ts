import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireOrgAndUser } from '@/lib/auth'
import { getViewerScope, assertCapability } from '@/lib/rbac'
import { submitForApproval, ApprovalError } from '@/lib/approvals/engine'

/**
 * POST /api/offers/:id/submit — moves a draft offer to pending_approval.
 * Validates the offer is currently a draft, then asks the engine to instantiate
 * an approval against the org's 'offer' approval chain. Mirrors the openings
 * submit route; the engine's applyApproved/Rejected/Draft branches keep the
 * offer's status in sync as approvers decide.
 */
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireOrgAndUser()
  if (auth instanceof NextResponse) return auth
  const { orgId, userId } = auth

  const supabase = createAdminClient()
  const denied = assertCapability(await getViewerScope(supabase, orgId, userId), 'recruiting:edit')
  if (denied) return denied

  const { data: row, error } = await supabase
    .from('offers')
    .select('*')
    .eq('id', params.id)
    .eq('org_id', orgId)
    .single()
  if (error || !row) return NextResponse.json({ error: 'Offer not found' }, { status: 404 })
  const offer = row as { id: string; status: string }

  if (offer.status !== 'draft') {
    return NextResponse.json(
      { error: `Offer is in '${offer.status}', not 'draft'.` },
      { status: 409 },
    )
  }

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
    if (err instanceof ApprovalError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    throw err
  }

  // Stamp the offer with approval_id + status. If the engine auto-completed
  // (single-requester chain), applyApprovedToTarget already set status='approved'
  // but doesn't know the approval_id — set both consistently here.
  const newStatus = result.status === 'approved' ? 'approved' : 'pending_approval'
  await supabase
    .from('offers')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .update({ approval_id: result.approvalId, status: newStatus } as any)
    .eq('id', offer.id)

  return NextResponse.json({
    ok: true,
    approval_id: result.approvalId,
    status: result.status,
    auto_approved: result.autoApproved,
  })
}
