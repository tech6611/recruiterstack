import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireOrg } from '@/lib/auth'
import { parseBody } from '@/lib/api/helpers'
import { roleUpdateSchema } from '@/lib/validations/roles'

// GET /api/roles/:id
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const authResult = await requireOrg()
  if (authResult instanceof NextResponse) return authResult
  const { orgId } = authResult

  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('roles')
    .select('*')
    .eq('id', params.id)
    .eq('org_id', orgId)
    .single()

  if (error) {
    const status = error.code === 'PGRST116' ? 404 : 500
    return NextResponse.json({ error: error.message }, { status })
  }

  return NextResponse.json({ data })
}

// PATCH /api/roles/:id
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const authResult = await requireOrg()
  if (authResult instanceof NextResponse) return authResult
  const { orgId } = authResult

  const supabase = createAdminClient()

  const parsed = await parseBody(request, roleUpdateSchema)
  if (parsed instanceof NextResponse) return parsed

  const { data, error } = await supabase
    .from('roles')
    .update(parsed as import('@/lib/types/database').RoleUpdate)
    .eq('id', params.id)
    .eq('org_id', orgId)
    .select()
    .single()

  if (error) {
    const status = error.code === 'PGRST116' ? 404 : 500
    return NextResponse.json({ error: error.message }, { status })
  }

  return NextResponse.json({ data })
}

// DELETE /api/roles/:id
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const authResult = await requireOrg()
  if (authResult instanceof NextResponse) return authResult
  const { orgId } = authResult

  const supabase = createAdminClient()

  const { error } = await supabase.from('roles').delete().eq('id', params.id).eq('org_id', orgId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return new NextResponse(null, { status: 204 })
}
