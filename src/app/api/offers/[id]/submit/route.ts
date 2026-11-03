import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireOrgAndUser } from '@/lib/auth'
import { getViewerScope, assertCapability } from '@/lib/rbac'
import { submitOfferForApproval } from '@/modules/ats/domain/hiring'

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

  // Shared with the copilot's update_offer_status (modules/ats/domain/hiring).
  const r = await submitOfferForApproval(supabase, orgId, params.id, userId)
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status })
  return NextResponse.json({
    ok: true,
    approval_id: r.approval_id,
    status: r.status,
    auto_approved: r.auto_approved,
  })
}
