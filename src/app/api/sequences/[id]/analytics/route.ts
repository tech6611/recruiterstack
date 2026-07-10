import { NextResponse } from 'next/server'
import { withCapability } from '@/lib/api/helpers'
import { getSequenceAnalytics } from '@/modules/crm/domain/sequences'
import { resolveWindow } from '@/lib/sequences/range'

// GET /api/sequences/[id]/analytics?range=7d|30d|90d|all|custom&start=&end= —
// sequence performance analytics, scoped to the window (default all-time).
export const GET = withCapability('recruiting:view', async (req, orgId, supabase, { params }) => {
  try {
    // No range param → all-time (preserves the historical analytics default).
    const p = new URL(req.url).searchParams
    const window = resolveWindow(p.get('range') ?? 'all', p.get('start'), p.get('end'))
    const data = await getSequenceAnalytics(supabase, orgId, params.id, window)
    if (!data) return NextResponse.json({ error: 'Sequence not found' }, { status: 404 })
    return NextResponse.json({ data })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch analytics' },
      { status: 500 },
    )
  }
})
