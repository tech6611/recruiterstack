import { NextResponse } from 'next/server'
import { withCapability, parseBody } from '@/lib/api/helpers'
import { roleUpdateSchema } from '@/lib/validations/roles'
import { deleteRoleProfile, getRoleProfile, updateRoleProfile } from '@/modules/ats/domain/role-profiles'

// GET /api/roles/:id
export const GET = withCapability('recruiting:view', async (_req, orgId, supabase, { params }) => {
  try {
    const data = await getRoleProfile(supabase, orgId, params.id)
    if (!data) return NextResponse.json({ error: 'Role not found' }, { status: 404 })
    return NextResponse.json({ data })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to load role' },
      { status: 500 },
    )
  }
})

// PATCH /api/roles/:id
export const PATCH = withCapability('recruiting:edit', async (request, orgId, supabase, { params }) => {
  const parsed = await parseBody(request, roleUpdateSchema)
  if (parsed instanceof NextResponse) return parsed

  try {
    const data = await updateRoleProfile(
      supabase,
      orgId,
      params.id,
      parsed as import('@/lib/types/database').RoleUpdate,
    )
    if (!data) return NextResponse.json({ error: 'Role not found' }, { status: 404 })
    return NextResponse.json({ data })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to update role' },
      { status: 500 },
    )
  }
})

// DELETE /api/roles/:id
export const DELETE = withCapability('recruiting:edit', async (_req, orgId, supabase, { params }) => {
  try {
    await deleteRoleProfile(supabase, orgId, params.id)
    return new NextResponse(null, { status: 204 })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to delete role' },
      { status: 500 },
    )
  }
})
