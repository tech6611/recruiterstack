import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireOrgAndUser } from '@/lib/auth'
import { assertAdmin, getViewerScope } from '@/lib/rbac'
import {
  getConversionFunnel,
  getCostPerActiveHire,
  getTenureDistribution,
  getTimeToHire,
} from '@/modules/core/domain/people-analytics'

// GET /api/analytics/people — admin only. Returns all 4 cross-module metrics
// in one payload. Each metric is independently evaluated so a single slow /
// failing query doesn't sink the page; the response shape always has the
// four keys, with `error` set on any that failed.
export async function GET(req: NextRequest) {
  const authResult = await requireOrgAndUser()
  if (authResult instanceof NextResponse) return authResult
  const { orgId, userId } = authResult

  const supabase = createAdminClient()
  const scope = await getViewerScope(supabase, orgId, userId)
  const guard = assertAdmin(scope)
  if (guard) return guard

  const daysParam = req.nextUrl.searchParams.get('days')
  const days = clampDays(daysParam ? Number(daysParam) : 90)

  const [fS, tS, cS, nS] = await Promise.allSettled([
    getConversionFunnel    (supabase, orgId, days),
    getTimeToHire          (supabase, orgId, days),
    getCostPerActiveHire   (supabase, orgId, days),
    getTenureDistribution  (supabase, orgId),
  ])

  return NextResponse.json({
    data: {
      window_days: days,
      conversion_funnel:    unwrap(fS),
      time_to_hire:         unwrap(tS),
      cost_per_active_hire: unwrap(cS),
      tenure_distribution:  unwrap(nS),
    },
  })
}

function clampDays(n: number): number {
  if (!Number.isFinite(n)) return 90
  return Math.max(7, Math.min(365 * 3, Math.round(n)))         // 1 week → 3 years
}

function unwrap<T>(r: PromiseSettledResult<T>): { data: T | null; error: string | null } {
  return r.status === 'fulfilled'
    ? { data: r.value,                                                 error: null }
    : { data: null, error: r.reason instanceof Error ? r.reason.message : String(r.reason) }
}
