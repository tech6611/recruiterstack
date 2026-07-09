import { NextResponse } from 'next/server'
import { withCapability } from '@/lib/api/helpers'
import { listSequencesForExport } from '@/modules/crm/domain/sequences'

// GET /api/sequences/export?range=7d|30d|90d|all
// Returns one row per sequence with the funnel scoped to activity in the window
// (option B). The client turns this into a CSV download.
const RANGE_DAYS: Record<string, number | null> = {
  '7d':  7,
  '30d': 30,
  '90d': 90,
  'all': null,
}

export const GET = withCapability('recruiting:view', async (req, orgId, supabase) => {
  try {
    const range = new URL(req.url).searchParams.get('range') ?? '30d'
    const days  = range in RANGE_DAYS ? RANGE_DAYS[range] : 30
    const since = days === null ? null : new Date(Date.now() - days * 24 * 60 * 60 * 1000)

    const data = await listSequencesForExport(supabase, orgId, since)
    return NextResponse.json({ data })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to export sequences' },
      { status: 500 },
    )
  }
})
