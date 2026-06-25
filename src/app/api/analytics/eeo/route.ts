import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireOrgAndUser } from '@/lib/auth'
import { getViewerScope, assertCapability } from '@/lib/rbac'
import { getEeoReport } from '@/modules/ats/domain/reporting'

// GET /api/analytics/eeo — aggregate, anonymous EEO / voluntary compliance
// report. Gated behind the dedicated `compliance:view` capability so the hiring
// team (recruiting:* / analytics:view) can't see demographic data.
export async function GET() {
  const authResult = await requireOrgAndUser()
  if (authResult instanceof NextResponse) return authResult
  const { orgId, userId } = authResult

  const supabase = createAdminClient()
  const scope = await getViewerScope(supabase, orgId, userId)
  const denied = assertCapability(scope, 'compliance:view')
  if (denied) return denied

  const data = await getEeoReport(supabase, orgId)
  return NextResponse.json({ data })
}
