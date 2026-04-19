import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireOrgAndUser } from '@/lib/auth'
import type { OrgRole } from '@/lib/types/requisitions'

/**
 * Minimal "who am I" — returns the current user's role within their active org.
 * Used by any dashboard surface that needs admin-only gating (Settings, Team, etc.).
 */
export async function GET() {
  const authResult = await requireOrgAndUser()
  if (authResult instanceof NextResponse) return authResult
  const { orgId, userId, clerkUserId } = authResult

  const supabase = createAdminClient()
  const { data: member } = await supabase
    .from('org_members')
    .select('role, is_active, onboarded_at')
    .eq('org_id', orgId)
    .eq('user_id', userId)
    .maybeSingle()

  const row = member as { role: OrgRole; is_active: boolean; onboarded_at: string | null } | null

  return NextResponse.json({
    data: {
      user_id:        userId,
      clerk_user_id:  clerkUserId,
      org_id:         orgId,
      role:           row?.role ?? null,
      is_active:      row?.is_active ?? true,
      onboarded_at:   row?.onboarded_at ?? null,
      is_admin:       row?.role === 'admin',
    },
  })
}
