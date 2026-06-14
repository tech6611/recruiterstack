import { NextResponse } from 'next/server'
import { withCapability } from '@/lib/api/helpers'
import { listEnrollments } from '@/modules/crm/domain/sequences'

// GET /api/sequences/[id]/enrollments — enrollments for the sequence,
// flattened with candidate name/email.
export const GET = withCapability('recruiting:view', async (_req, orgId, supabase, { params }) => {
  try {
    const data = await listEnrollments(supabase, orgId, params.id)
    return NextResponse.json({ data })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to list enrollments'
    const status  = message === 'Sequence not found' ? 404 : 500
    return NextResponse.json({ error: message }, { status })
  }
})
