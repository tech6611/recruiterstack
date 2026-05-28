import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireOrgAndUser } from '@/lib/auth'
import { getEmployeeDetail, getMyEmployeeProfile } from '@/modules/hris/domain/employees'
import type { OrgRole } from '@/lib/types/requisitions'

/**
 * "Who am I" — returns the current user's role + employee_profile in their
 * active org. Used by any dashboard surface that needs admin-only gating
 * (Settings, Team, etc.) AND by the employee self-service `/me/*` surface to
 * know which employee record (if any) the calling user maps to.
 *
 * `employee` is null when the user has no employee_profile bridged yet
 * (e.g. admins/recruiters who weren't hired through the ATS flow).
 */
export async function GET() {
  const authResult = await requireOrgAndUser()
  if (authResult instanceof NextResponse) return authResult
  const { orgId, userId, clerkUserId } = authResult

  const supabase = createAdminClient()
  const [{ data: member }, employee] = await Promise.all([
    supabase
      .from('org_members')
      .select('role, is_active, onboarded_at')
      .eq('org_id', orgId)
      .eq('user_id', userId)
      .maybeSingle(),
    (async () => {
      const profile = await getMyEmployeeProfile(supabase, orgId, userId)
      return profile ? await getEmployeeDetail(supabase, orgId, profile.id) : null
    })(),
  ])

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
      employee,                                       // null when not bridged yet
    },
  })
}
