import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireOwner } from '@/lib/auth-admin'
import { updateRole, deleteRole } from '@/modules/core/domain/roles'

// PATCH /api/admin/roles/[id] — Owner-only. Updates a custom role.
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await requireOwner()
  if (auth instanceof NextResponse) return auth

  let body: { name?: unknown; description?: unknown; capabilities?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  const input: {
    name?: string
    description?: string | null
    capabilities?: string[]
  } = {}
  if (typeof body.name === 'string') {
    const name = body.name.trim()
    if (!name) {
      return NextResponse.json({ error: 'Role name cannot be empty.' }, { status: 400 })
    }
    input.name = name
  }
  if (body.description === null || typeof body.description === 'string') {
    input.description = body.description as string | null
  }
  if (Array.isArray(body.capabilities)) {
    input.capabilities = body.capabilities.filter(
      (c): c is string => typeof c === 'string',
    )
  }

  try {
    const supabase = createAdminClient()
    const data = await updateRole(supabase, auth.orgId, params.id, input)
    if (!data) {
      return NextResponse.json(
        { error: 'Role not found, or system roles cannot be edited.' },
        { status: 400 },
      )
    }
    return NextResponse.json({ data })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to update role.' },
      { status: 500 },
    )
  }
}

// DELETE /api/admin/roles/[id] — Owner-only. Deletes a custom role.
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await requireOwner()
  if (auth instanceof NextResponse) return auth

  try {
    const supabase = createAdminClient()
    const deleted = await deleteRole(supabase, auth.orgId, params.id)
    if (!deleted) {
      return NextResponse.json(
        { error: 'Role not found, or system roles cannot be deleted.' },
        { status: 400 },
      )
    }
    return NextResponse.json({ data: { id: params.id } })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to delete role.' },
      { status: 500 },
    )
  }
}
