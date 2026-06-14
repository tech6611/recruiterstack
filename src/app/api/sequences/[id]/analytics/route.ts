import { NextResponse } from 'next/server'
import { withCapability } from '@/lib/api/helpers'
import { getSequenceAnalytics } from '@/modules/crm/domain/sequences'

// GET /api/sequences/[id]/analytics — sequence performance analytics.
export const GET = withCapability('recruiting:view', async (_req, orgId, supabase, { params }) => {
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
})
