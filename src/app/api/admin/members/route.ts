import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireOwner } from '@/lib/auth-admin'
import { listMembersWithRoles } from '@/modules/core/domain/roles'

// GET /api/admin/members — Owner-only. Lists active org members with their
// RBAC role assignments and per-member capability overrides.
export async function GET() {
  const auth = await requireOwner()
  if (auth instanceof NextResponse) return auth

  const supabase = createAdminClient()
  try {
    const data = await listMembersWithRoles(supabase, auth.orgId)
    return NextResponse.json({ data })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
