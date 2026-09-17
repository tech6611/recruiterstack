import { NextResponse } from 'next/server'
import { withCapability } from '@/lib/api/helpers'
import { cached, cacheKey } from '@/lib/api/cache'
import { getHeadcountReport } from '@/modules/ats/domain/headcount-reporting'

// GET /api/analytics/headcount?months=12 — seats by state, monthly flow,
// time to fill / start, jobs with seats remaining.
export const GET = withCapability('analytics:view', async (req, orgId, supabase) => {
  const months = Math.min(24, Math.max(3, parseInt(new URL(req.url).searchParams.get('months') ?? '12', 10) || 12))
  try {
    const data = await cached(cacheKey(orgId, `headcount:${months}`), 60, () => getHeadcountReport(supabase, orgId, months))
    return NextResponse.json({ data }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to build headcount report' }, { status: 500 })
  }
})
