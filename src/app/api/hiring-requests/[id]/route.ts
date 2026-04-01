import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireOrg } from '@/lib/auth'
import { parseBody, handleSupabaseError } from '@/lib/api/helpers'
import { hiringRequestUpdateSchema } from '@/lib/validations/hiring-requests'

// GET /api/hiring-requests/:id
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const authResult = await requireOrg()
  if (authResult instanceof NextResponse) return authResult
  const { orgId } = authResult

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('hiring_requests')
    .select('*')
    .eq('id', params.id)
    .eq('org_id', orgId)
    .single()

  if (error || !data) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ data })
}

// PATCH /api/hiring-requests/:id  — update status or other fields
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const authResult = await requireOrg()
  if (authResult instanceof NextResponse) return authResult
  const { orgId } = authResult

  const parsed = await parseBody(request, hiringRequestUpdateSchema)
  if (parsed instanceof NextResponse) return parsed

  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('hiring_requests')
    .update({ ...parsed, updated_at: new Date().toISOString() } as import('@/lib/types/database').HiringRequestUpdate)
    .eq('id', params.id)
    .eq('org_id', orgId)
    .select()
    .single()

  if (error) return handleSupabaseError(error)
  return NextResponse.json({ data })
}
