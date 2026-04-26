import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireOrgAndUser } from '@/lib/auth'
import { submitForApproval, ApprovalError } from '@/lib/approvals/engine'
import type { Opening } from '@/lib/types/requisitions'

/**
 * POST /api/openings/:id/submit — moves a draft opening to pending_approval.
 * Validates the opening is currently in draft, has a non-empty justification
 * (≥ 50 chars per the prompt's rule), then asks the engine to instantiate
 * an approval.
 */
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireOrgAndUser()
  if (auth instanceof NextResponse) return auth
  const { orgId, userId } = auth

  const supabase = createAdminClient()
  const { data: row, error } = await supabase
    .from('openings')
    .select('*')
    .eq('id', params.id)
    .eq('org_id', orgId)
    .single()
  if (error || !row) return NextResponse.json({ error: 'Opening not found' }, { status: 404 })
  const opening = row as Opening

  if (opening.status !== 'draft') {
    return NextResponse.json(
      { error: `Opening is in '${opening.status}', not 'draft'.` },
      { status: 409 },
    )
  }
  if (!opening.justification || opening.justification.trim().length < 50) {
    return NextResponse.json(
      { error: 'Justification must be at least 50 characters before submitting.' },
      { status: 400 },
    )
  }

  let result
  try {
    result = await submitForApproval({
      orgId,
      targetType:  'opening',
      targetId:    opening.id,
      target:      opening as unknown as Record<string, unknown>,
      requesterId: userId,
    })
  } catch (err) {
    if (err instanceof ApprovalError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    throw err
  }

  // Stamp opening with approval_id + status.
  // If the engine auto-completed (single requester chain or already approved),
  // applyApprovedToTarget already updated status — but it doesn't know the
  // approval_id. Set both consistently here.
  const newStatus = result.status === 'approved' ? 'approved' : 'pending_approval'
  await supabase
    .from('openings')
    .update({ approval_id: result.approvalId, status: newStatus })
    .eq('id', opening.id)

  return NextResponse.json({
    ok: true,
    approval_id: result.approvalId,
    status: result.status,
    auto_approved: result.autoApproved,
  })
}
