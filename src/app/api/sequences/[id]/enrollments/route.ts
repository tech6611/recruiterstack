import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireOrg } from '@/lib/auth'
import { listEnrollments } from '@/modules/crm/domain/sequences'

// GET /api/sequences/[id]/enrollments — enrollments for the sequence,
// flattened with candidate name/email.
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const authResult = await requireOrg()
  if (authResult instanceof NextResponse) return authResult
  const { orgId } = authResult

  const supabase = createAdminClient()
  try {
    const data = await listEnrollments(supabase, orgId, params.id)
    return NextResponse.json({ data })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to list enrollments'
    const status  = message === 'Sequence not found' ? 404 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
