import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireOrgAndUser } from '@/lib/auth'

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
