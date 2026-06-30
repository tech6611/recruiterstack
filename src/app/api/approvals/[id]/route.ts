import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireOrgAndUser } from '@/lib/auth'
import { getApprovalDetail } from '@/lib/approvals/queries'

// GET /api/approvals/:id — full approval state including steps + chain step metadata.
// The query lives in the shared `getApprovalDetail` facade so the copilot
// `get_approval` tool returns the same shape.
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireOrgAndUser()
  if (auth instanceof NextResponse) return auth
  const { orgId } = auth

  const supabase = createAdminClient()
  try {
    const data = await getApprovalDetail(supabase, orgId, params.id)
    if (!data) return NextResponse.json({ error: 'Approval not found' }, { status: 404 })
    return NextResponse.json({ data })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to load approval' }, { status: 500 })
  }
}
