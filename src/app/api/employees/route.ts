import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireOrg } from '@/lib/auth'
import { listEmployees } from '@/lib/domain/employees'
import type { EmployeeStatus } from '@/lib/types/database'

const VALID_STATUSES: EmployeeStatus[] = ['pending', 'active', 'terminated']

export async function GET(req: NextRequest) {
  const authResult = await requireOrg()
  if (authResult instanceof NextResponse) return authResult
  const { orgId } = authResult

  const statusParam = req.nextUrl.searchParams.get('status')
  const status = VALID_STATUSES.includes(statusParam as EmployeeStatus)
    ? (statusParam as EmployeeStatus)
    : undefined

  const supabase = createAdminClient()
  try {
    const data = await listEmployees(supabase, orgId, status)
    return NextResponse.json({ data })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to list employees' },
      { status: 500 },
    )
  }
}
