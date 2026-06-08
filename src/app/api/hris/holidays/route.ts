import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireOrgAndUser } from '@/lib/auth'
import { parseBody } from '@/lib/api/helpers'
import { assertAdmin, getViewerScope } from '@/lib/rbac'
import { holidayCreateSchema } from '@/lib/validations/leave-balances'
import { createHoliday, listHolidays } from '@/modules/hris/domain/leave-balances'

// GET /api/hris/holidays — admin only. Lists all holidays for the org.
export async function GET(req: NextRequest) {
  const authResult = await requireOrgAndUser()
  if (authResult instanceof NextResponse) return authResult
  const { orgId, userId } = authResult

  const supabase = createAdminClient()
  const scope = await getViewerScope(supabase, orgId, userId)
  const guard = assertAdmin(scope)
  if (guard) return guard

  const from = req.nextUrl.searchParams.get('from') ?? undefined

  try {
    const data = await listHolidays(supabase, orgId, { from })
    return NextResponse.json({ data })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to list holidays' },
      { status: 500 },
    )
  }
}

// POST /api/hris/holidays — admin only.
export async function POST(req: NextRequest) {
  const authResult = await requireOrgAndUser()
  if (authResult instanceof NextResponse) return authResult
  const { orgId, userId } = authResult

  const supabase = createAdminClient()
  const scope = await getViewerScope(supabase, orgId, userId)
  const guard = assertAdmin(scope)
  if (guard) return guard

  const parsed = await parseBody(req, holidayCreateSchema)
  if (parsed instanceof NextResponse) return parsed

  try {
    const data = await createHoliday(supabase, orgId, {
      date:    parsed.date,
      name:    parsed.name,
      country: parsed.country ?? null,
    })
    return NextResponse.json({ data })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to create holiday' },
      { status: 500 },
    )
  }
}
