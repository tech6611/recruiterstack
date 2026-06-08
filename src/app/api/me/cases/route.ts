import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireOrgAndUser } from '@/lib/auth'
import { parseBody } from '@/lib/api/helpers'
import { hrCaseCreateSchema } from '@/lib/validations/hr-cases'
import { createCase, listMyCases } from '@/modules/hris/domain/cases'
import { getMyEmployeeProfile } from '@/modules/hris/domain/employees'

// GET /api/me/cases — list my HR cases.
export async function GET() {
  const authResult = await requireOrgAndUser()
  if (authResult instanceof NextResponse) return authResult
  const { orgId, userId } = authResult

  const supabase = createAdminClient()
  try {
    const data = await listMyCases(supabase, orgId, userId)
    return NextResponse.json({ data })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to list cases' },
      { status: 500 },
    )
  }
}

// POST /api/me/cases — submit a new HR case. Auto-fires the AI first-responder.
export async function POST(req: NextRequest) {
  const authResult = await requireOrgAndUser()
  if (authResult instanceof NextResponse) return authResult
  const { orgId, userId } = authResult

  const parsed = await parseBody(req, hrCaseCreateSchema)
  if (parsed instanceof NextResponse) return parsed

  const supabase = createAdminClient()
  try {
    // Best-effort attach the requester's employee_profile id (so the AI has
    // richer context); null if the user has no employee record yet.
    const profile = await getMyEmployeeProfile(supabase, orgId, userId)

    const data = await createCase(supabase, orgId, {
      requesterUserId:     userId,
      requesterEmployeeId: profile?.id ?? null,
      category:            parsed.category,
      subject:             parsed.subject,
      body:                parsed.body,
    })
    return NextResponse.json({ data })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to create case' },
      { status: 500 },
    )
  }
}
