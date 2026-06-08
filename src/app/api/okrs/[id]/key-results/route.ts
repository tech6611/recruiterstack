import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireOrgAndUser } from '@/lib/auth'
import { parseBody } from '@/lib/api/helpers'
import { forbidden, getViewerScope } from '@/lib/rbac'
import { krCreateSchema } from '@/lib/validations/okrs'
import { addKeyResult } from '@/modules/hris/domain/okrs'
import type { Okr } from '@/lib/types/database'

// POST /api/okrs/[id]/key-results — admin / owner adds a KR to an OKR.
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const authResult = await requireOrgAndUser()
  if (authResult instanceof NextResponse) return authResult
  const { orgId, userId } = authResult

  const supabase = createAdminClient()
  const { data: row, error } = await supabase
    .from('okrs').select('*').eq('id', params.id).eq('org_id', orgId).maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!row) return NextResponse.json({ error: 'OKR not found' }, { status: 404 })

  const okr = row as Okr
  const scope = await getViewerScope(supabase, orgId, userId)
  if (!scope.isAdmin && scope.employeeId !== okr.owner_employee_id) return forbidden()

  const parsed = await parseBody(req, krCreateSchema)
  if (parsed instanceof NextResponse) return parsed

  try {
    const data = await addKeyResult(supabase, orgId, {
      okrId:        params.id,
      title:        parsed.title,
      description:  parsed.description ?? null,
      progress:     parsed.progress,
      targetMetric: parsed.target_metric ?? null,
      sortOrder:    parsed.sort_order,
    })
    return NextResponse.json({ data })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to add key result' },
      { status: 500 },
    )
  }
}
