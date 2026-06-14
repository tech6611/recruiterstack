import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireOwner } from '@/lib/auth-admin'
import { assignRole, unassignRole } from '@/modules/core/domain/roles'

// POST /api/admin/members/:userId/roles — Owner-only. Assigns an RBAC role to
// the member (idempotent). Body: { roleId }.
export async function POST(req: NextRequest, { params }: { params: { userId: string } }) {
  const auth = await requireOwner()
  if (auth instanceof NextResponse) return auth

  let body: { roleId?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const roleId = body?.roleId
  if (typeof roleId !== 'string' || roleId.length === 0) {
    return NextResponse.json({ error: 'roleId is required' }, { status: 400 })
  }

  const supabase = createAdminClient()
  try {
    await assignRole(supabase, auth.orgId, params.userId, roleId)
    return NextResponse.json({ data: { user_id: params.userId, role_id: roleId } })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}

// DELETE /api/admin/members/:userId/roles — Owner-only. Removes an RBAC role
// from the member (idempotent). roleId from body { roleId } or ?roleId=.
export async function DELETE(req: NextRequest, { params }: { params: { userId: string } }) {
  const auth = await requireOwner()
  if (auth instanceof NextResponse) return auth

  let roleId = req.nextUrl.searchParams.get('roleId') ?? undefined
  if (!roleId) {
    try {
      const body = (await req.json()) as { roleId?: unknown }
      if (typeof body?.roleId === 'string') roleId = body.roleId
    } catch {
      // No/invalid body — fall through to validation below.
    }
  }

  if (typeof roleId !== 'string' || roleId.length === 0) {
    return NextResponse.json({ error: 'roleId is required' }, { status: 400 })
  }

  const supabase = createAdminClient()
  try {
    await unassignRole(supabase, auth.orgId, params.userId, roleId)
    return NextResponse.json({ data: { user_id: params.userId, role_id: roleId } })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
