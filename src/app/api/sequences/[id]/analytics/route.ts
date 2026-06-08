import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireOrg } from '@/lib/auth'
import { getSequenceAnalytics } from '@/modules/crm/domain/sequences'

// GET /api/sequences/[id]/analytics — sequence performance analytics.
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const authResult = await requireOrg()
  if (authResult instanceof NextResponse) return authResult
  const { orgId } = authResult

  const supabase = createAdminClient()
  try {
    const data = await getSequenceAnalytics(supabase, orgId, params.id)
    if (!data) return NextResponse.json({ error: 'Sequence not found' }, { status: 404 })
    return NextResponse.json({ data })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch analytics' },
      { status: 500 },
    )
  }
}
