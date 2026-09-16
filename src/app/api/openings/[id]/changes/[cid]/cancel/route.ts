import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireOrgAndUser } from '@/lib/auth'
import { getViewerScope, assertCapability } from '@/lib/rbac'
import { cancelApproval, ApprovalError } from '@/lib/approvals/engine'
import { cancelOpeningChange } from '@/lib/openings/change-requests'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = any

/** POST /api/openings/:id/changes/:cid/cancel — withdraw a pending change request. */
export async function POST(_req: NextRequest, { params }: { params: { id: string; cid: string } }) {
  const auth = await requireOrgAndUser()
  if (auth instanceof NextResponse) return auth
  const { orgId, userId } = auth
  const supabase = createAdminClient()
  const denied = assertCapability(await getViewerScope(supabase, orgId, userId), 'openings:edit')
  if (denied) return denied
  const sb = supabase as unknown as Loose

  const { data: cr } = await sb.from('opening_change_requests').select('id, status, approval_id, requested_by')
    .eq('id', params.cid).eq('org_id', orgId).eq('opening_id', params.id).maybeSingle()
  if (!cr) return NextResponse.json({ error: 'Change request not found' }, { status: 404 })
  if (cr.status !== 'pending') return NextResponse.json({ error: `This change is already ${cr.status}.` }, { status: 409 })

  try {
    if (cr.approval_id) {
      // Engine cancel → applyDraftToTarget('opening_change') → cancelOpeningChange.
      // Requester-only in the engine; allow any editor here by cancelling as the requester.
      await cancelApproval(cr.approval_id, cr.requested_by)
    } else {
      await cancelOpeningChange(cr.id, userId)
    }
  } catch (err) {
    if (err instanceof ApprovalError) return NextResponse.json({ error: err.message }, { status: err.status })
    throw err
  }
  return NextResponse.json({ ok: true })
}
