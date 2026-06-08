import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireOrgAndUser } from '@/lib/auth'
import { forbidden } from '@/lib/rbac'
import { getCase } from '@/modules/hris/domain/cases'

// GET /api/me/cases/[id] — case detail + messages. Only the requester themselves.
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const authResult = await requireOrgAndUser()
  if (authResult instanceof NextResponse) return authResult
  const { orgId, userId } = authResult

  const supabase = createAdminClient()
  try {
    const result = await getCase(supabase, orgId, params.id)
    if (!result) return NextResponse.json({ error: 'Case not found' }, { status: 404 })
    if (result.case.requester_user_id !== userId) return forbidden()
    return NextResponse.json({ data: result })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch case' },
      { status: 500 },
    )
  }
}
