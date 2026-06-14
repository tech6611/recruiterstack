import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireOrgAndUser } from '@/lib/auth'
import { parseBody } from '@/lib/api/helpers'
import { assertCapability, getViewerScope } from '@/lib/rbac'
import { hrCaseMessageSchema } from '@/lib/validations/hr-cases'
import { addMessage } from '@/modules/hris/domain/cases'

// POST /api/hris/cases/[id]/messages — admin (HR) posts a reply on a case.
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const authResult = await requireOrgAndUser()
  if (authResult instanceof NextResponse) return authResult
  const { orgId, userId } = authResult

  const supabase = createAdminClient()
  const scope = await getViewerScope(supabase, orgId, userId)
  const guard = assertCapability(scope, 'hr_cases:edit')
  if (guard) return guard

  const parsed = await parseBody(req, hrCaseMessageSchema)
  if (parsed instanceof NextResponse) return parsed

  try {
    const data = await addMessage(supabase, orgId, params.id, 'hr', parsed.body, userId)
    return NextResponse.json({ data })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to post message' },
      { status: 500 },
    )
  }
}
