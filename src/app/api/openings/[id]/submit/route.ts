import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireOrgAndUser } from '@/lib/auth'
import { getViewerScope, assertCapability } from '@/lib/rbac'
import { submitOpeningForApproval, OpeningSubmitError } from '@/modules/ats/domain/openings'

/**
 * POST /api/openings/:id/submit — moves a draft opening to pending_approval.
 * Validation (draft state, ≥ 50-char justification, required custom fields) and
 * the approval-engine call live in the canonical facade, shared with the
 * copilot `submit_opening_for_approval` tool.
 */
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireOrgAndUser()
  if (auth instanceof NextResponse) return auth
  const { orgId, userId } = auth

  const supabase = createAdminClient()
  const scope = await getViewerScope(supabase, orgId, userId)
  const denied = assertCapability(scope, 'openings:edit')
  if (denied) return denied

  try {
    const result = await submitOpeningForApproval(supabase, orgId, userId, params.id)
    return NextResponse.json({
      ok: true,
      approval_id: result.approvalId,
      status: result.status,
      auto_approved: result.autoApproved,
    })
  } catch (err) {
    if (err instanceof OpeningSubmitError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    throw err
  }
}
