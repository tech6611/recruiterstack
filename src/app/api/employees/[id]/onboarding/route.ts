import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/server'
import { requireOrgAndUser } from '@/lib/auth'
import { parseBody } from '@/lib/api/helpers'
import { assertAdmin, getViewerScope } from '@/lib/rbac'
import { createPlanFromTemplate } from '@/modules/hris/domain/onboarding'

const startSchema = z.object({
  template_id: z.string().uuid(),
  start_date:  z.string().nullish(),                // YYYY-MM-DD; defaults to employee.start_date or today
})

// POST /api/employees/[id]/onboarding — admin only. Starts an onboarding plan
// from the given template for the named employee. The unique partial index
// guarantees at most one in_progress plan per employee.
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const authResult = await requireOrgAndUser()
  if (authResult instanceof NextResponse) return authResult
  const { orgId, userId } = authResult

  const supabase = createAdminClient()
  const scope = await getViewerScope(supabase, orgId, userId)
  const guard = assertAdmin(scope)
  if (guard) return guard

  const parsed = await parseBody(req, startSchema)
  if (parsed instanceof NextResponse) return parsed

  try {
    const data = await createPlanFromTemplate(supabase, orgId, {
      employeeId: params.id,
      templateId: parsed.template_id,
      startDate:  parsed.start_date ?? null,
      startedBy:  userId,
    })
    return NextResponse.json({ data })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to start onboarding' },
      { status: 500 },
    )
  }
}
