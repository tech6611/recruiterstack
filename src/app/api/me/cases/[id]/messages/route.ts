import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireOrgAndUser } from '@/lib/auth'
import { parseBody } from '@/lib/api/helpers'
import { forbidden } from '@/lib/rbac'
import { hrCaseMessageSchema } from '@/lib/validations/hr-cases'
import { addMessage } from '@/modules/hris/domain/cases'
import type { HrCase } from '@/lib/types/database'

// POST /api/me/cases/[id]/messages — employee reply on their own case.
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const authResult = await requireOrgAndUser()
  if (authResult instanceof NextResponse) return authResult
  const { orgId, userId } = authResult

  const parsed = await parseBody(req, hrCaseMessageSchema)
  if (parsed instanceof NextResponse) return parsed

  const supabase = createAdminClient()
  // Confirm ownership.
  const { data: caseRow, error } = await supabase
    .from('hr_cases')
    .select('id, requester_user_id')
    .eq('id', params.id).eq('org_id', orgId).maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!caseRow) return NextResponse.json({ error: 'Case not found' }, { status: 404 })
  if ((caseRow as Pick<HrCase, 'requester_user_id'>).requester_user_id !== userId) {
    return forbidden()
  }

  try {
    const data = await addMessage(supabase, orgId, params.id, 'employee', parsed.body, userId)
    return NextResponse.json({ data })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to post message' },
      { status: 500 },
    )
  }
}
