import { NextResponse } from 'next/server'
import { withCapability } from '@/lib/api/helpers'
import { getSequenceAnalytics } from '@/modules/crm/domain/sequences'
import { rangeToSince } from '@/lib/sequences/range'

// GET /api/sequences/[id]/analytics?range=7d|30d|90d|all — sequence performance
// analytics, scoped to the window (default 30d).
export const GET = withCapability('recruiting:view', async (req, orgId, supabase, { params }) => {
  try {
    // No range param → all-time (preserves the historical analytics default).
    const range = new URL(req.url).searchParams.get('range') ?? 'all'
    const data = await getSequenceAnalytics(supabase, orgId, params.id, rangeToSince(range))
    if (!data) return NextResponse.json({ error: 'Sequence not found' }, { status: 404 })
    return NextResponse.json({ data })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch analytics' },
      { status: 500 },
    )
  }
})
