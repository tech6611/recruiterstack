import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireOrgAndUser } from '@/lib/auth'
import { assertCapability, getViewerScope } from '@/lib/rbac'
import { listOkrs } from '@/modules/hris/domain/okrs'
import type { OkrStatus } from '@/lib/types/database'

const VALID_STATUS: OkrStatus[] = ['draft','active','achieved','missed','abandoned']

// GET /api/hris/okrs — admin only. Org-wide list. Optional cycle + status filters.
export async function GET(req: NextRequest) {
  const authResult = await requireOrgAndUser()
  if (authResult instanceof NextResponse) return authResult
  const { orgId, userId } = authResult

  const supabase = createAdminClient()
  const scope = await getViewerScope(supabase, orgId, userId)
  const guard = assertCapability(scope, 'okrs:view')
  if (guard) return guard

  const sp = req.nextUrl.searchParams
  const cycle  = sp.get('cycle') ?? undefined
  const statusParam = sp.get('status')
  const status = VALID_STATUS.includes(statusParam as OkrStatus) ? (statusParam as OkrStatus) : undefined

  try {
    const data = await listOkrs(supabase, orgId, { cycle, status })
    return NextResponse.json({ data })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to list OKRs' },
      { status: 500 },
    )
  }
}
