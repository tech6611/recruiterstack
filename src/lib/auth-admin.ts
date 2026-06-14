import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireOrgAndUser } from '@/lib/auth'
import { getViewerScope, assertCapability } from '@/lib/rbac'
import type { Capability } from '@/lib/permissions'

/**
 * Returns { orgId, userId } if the current user is an active admin in their
 * org, or a 401/403 NextResponse otherwise. Used by all admin-only mutations.
 */
export async function requireAdmin(): Promise<
  { orgId: string; userId: string; clerkUserId: string } | NextResponse
> {
  const auth = await requireOrgAndUser()
  if (auth instanceof NextResponse) return auth

  const supabase = createAdminClient()
  const { data } = await supabase
    .from('org_members')
    .select('role, is_active')
    .eq('org_id', auth.orgId)
    .eq('user_id', auth.userId)
    .maybeSingle()

  const row = data as { role: string; is_active: boolean } | null
  if (!row || !row.is_active || row.role !== 'admin') {
    return NextResponse.json({ error: 'Admin access required.' }, { status: 403 })
  }
  return auth
}

/**
 * RBAC variant of requireAdmin: returns { orgId, userId, clerkUserId } if the
 * caller holds `capability`, or a 401/403 NextResponse otherwise. Same return
 * shape as requireAdmin so admin-only routes convert with a one-line swap.
 */
export async function requireCapability(capability: Capability): Promise<
  { orgId: string; userId: string; clerkUserId: string } | NextResponse
> {
  const auth = await requireOrgAndUser()
  if (auth instanceof NextResponse) return auth

  const supabase = createAdminClient()
  const scope = await getViewerScope(supabase, auth.orgId, auth.userId)
  const denied = assertCapability(scope, capability)
  if (denied) return denied
  return auth
}
