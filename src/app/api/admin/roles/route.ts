import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireOwner } from '@/lib/auth-admin'
import {
  listRolesWithCapabilities,
  createRole,
} from '@/modules/core/domain/roles'

// GET /api/admin/roles — Owner-only. Lists roles with their capabilities.
export async function GET() {
  const auth = await requireOwner()
  if (auth instanceof NextResponse) return auth

  try {
    const supabase = createAdminClient()
    const data = await listRolesWithCapabilities(supabase, auth.orgId)
    return NextResponse.json({ data })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to list roles.' },
      { status: 500 },
    )
  }
}

// POST /api/admin/roles — Owner-only. Creates a custom role.
export async function POST(req: NextRequest) {
  const auth = await requireOwner()
  if (auth instanceof NextResponse) return auth

  let body: { name?: unknown; description?: unknown; capabilities?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  const name = typeof body.name === 'string' ? body.name.trim() : ''
  if (!name) {
    return NextResponse.json({ error: 'Role name is required.' }, { status: 400 })
  }

  const description =
    typeof body.description === 'string' ? body.description : null
  const capabilities = Array.isArray(body.capabilities)
    ? body.capabilities.filter((c): c is string => typeof c === 'string')
    : undefined

  try {
    const supabase = createAdminClient()
    const data = await createRole(supabase, auth.orgId, {
      name,
      description,
      capabilities,
    })
    return NextResponse.json({ data }, { status: 201 })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to create role.' },
      { status: 500 },
    )
  }
}
