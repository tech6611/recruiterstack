import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireOrgAndUser } from '@/lib/auth'
import { listPendingApprovalsForUser } from '@/lib/approvals/queries'

/**
 * GET /api/approvals/inbox — pending steps awaiting the current user's decision.
 *
 * The listing logic lives in the shared `listPendingApprovalsForUser` facade
 * (src/lib/approvals/queries.ts) so the copilot `list_pending_approvals` tool
 * returns the exact same inbox.
 */
export async function GET() {
  const auth = await requireOrgAndUser()
  if (auth instanceof NextResponse) return auth
  const { orgId, userId } = auth

  const supabase = createAdminClient()
  try {
    const data = await listPendingApprovalsForUser(supabase, orgId, userId)
    return NextResponse.json({ data })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to load inbox' }, { status: 500 })
  }
}
