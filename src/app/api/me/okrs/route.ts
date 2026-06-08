import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireOrgAndUser } from '@/lib/auth'
import { parseBody } from '@/lib/api/helpers'
import { okrCreateSchema } from '@/lib/validations/okrs'
import { getMyEmployeeProfile } from '@/modules/hris/domain/employees'
import { createOkr, listOkrs } from '@/modules/hris/domain/okrs'

// GET /api/me/okrs — my OKRs (optionally by cycle).
export async function GET(req: NextRequest) {
  const authResult = await requireOrgAndUser()
  if (authResult instanceof NextResponse) return authResult
  const { orgId, userId } = authResult

  const cycle = req.nextUrl.searchParams.get('cycle') ?? undefined

  const supabase = createAdminClient()
  try {
    const profile = await getMyEmployeeProfile(supabase, orgId, userId)
    if (!profile) return NextResponse.json({ data: [] })
    const data = await listOkrs(supabase, orgId, { ownerEmployeeId: profile.id, cycle })
    return NextResponse.json({ data })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to list OKRs' },
      { status: 500 },
    )
  }
}

// POST /api/me/okrs — create a new objective for myself.
export async function POST(req: NextRequest) {
  const authResult = await requireOrgAndUser()
  if (authResult instanceof NextResponse) return authResult
  const { orgId, userId } = authResult

  const parsed = await parseBody(req, okrCreateSchema)
  if (parsed instanceof NextResponse) return parsed

  const supabase = createAdminClient()
  try {
    const profile = await getMyEmployeeProfile(supabase, orgId, userId)
    if (!profile) {
      return NextResponse.json(
        { error: 'You have no employee record in this org. Ask HR to add you before creating OKRs.' },
        { status: 403 },
      )
    }
    const data = await createOkr(supabase, orgId, {
      ownerEmployeeId: profile.id,
      title:           parsed.title,
      description:     parsed.description ?? null,
      cycle:           parsed.cycle,
      status:          parsed.status,
    })
    return NextResponse.json({ data })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to create OKR' },
      { status: 500 },
    )
  }
}
