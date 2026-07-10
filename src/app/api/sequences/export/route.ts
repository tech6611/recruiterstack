import { NextResponse } from 'next/server'
import { withCapability } from '@/lib/api/helpers'
import { listSequencesForExport } from '@/modules/crm/domain/sequences'
import { rangeToSince } from '@/lib/sequences/range'

// GET /api/sequences/export?range=7d|30d|90d|all
// Returns one row per sequence with the funnel scoped to activity in the window
// (option B). The client turns this into a CSV download.

export const GET = withCapability('recruiting:view', async (req, orgId, supabase) => {
  try {
    const range = new URL(req.url).searchParams.get('range')
    const data = await listSequencesForExport(supabase, orgId, rangeToSince(range))
    return NextResponse.json({ data })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to export sequences' },
      { status: 500 },
    )
  }
})
