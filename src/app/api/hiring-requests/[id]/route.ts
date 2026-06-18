import { NextResponse } from 'next/server'
import { withCapability, parseBody, handleSupabaseError } from '@/lib/api/helpers'
import { hiringRequestUpdateSchema } from '@/lib/validations/hiring-requests'

// GET /api/hiring-requests/:id
export const GET = withCapability('recruiting:view', async (_req, orgId, supabase, { params }) => {
  const { data, error } = await supabase
    .from('hiring_requests')
    .select('*')
    .eq('id', params.id)
    .eq('org_id', orgId)
    .single()

  if (error || !data) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ data })
})

// PATCH /api/hiring-requests/:id  — update status or other fields
export const PATCH = withCapability('recruiting:edit', async (request, orgId, supabase, { params }) => {
  const parsed = await parseBody(request, hiringRequestUpdateSchema)
  if (parsed instanceof NextResponse) return parsed

  const { data, error } = await supabase
    .from('hiring_requests')
    .update({ ...parsed, updated_at: new Date().toISOString() } as import('@/lib/types/database').HiringRequestUpdate)
    .eq('id', params.id)
    .eq('org_id', orgId)
    .select()
    .single()

  if (error) return handleSupabaseError(error)
  return NextResponse.json({ data })
})
