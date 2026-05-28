/**
 * RBAC for HRIS endpoints — three derived access tiers on top of org_members.role
 * and the users↔employee_profiles bridge:
 *
 *   admin   — org_members.role = 'admin' (HR-equivalent in this product); sees everything.
 *   self    — the calling user, for their own employee record.
 *   manager — the calling user, for any of their direct reports.
 *
 * `getViewerScope` resolves all three in one round-trip and is what every gated
 * endpoint calls. Helpers like `assertCanViewEmployee` return a 403 NextResponse
 * when access is denied so the route can `return` it as-is.
 */

import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'

type Supabase = SupabaseClient<Database>

export interface ViewerScope {
  isAdmin:      boolean
  employeeId:   string | null   // the viewer's own employee_profile id, if bridged
  reportIds:    Set<string>     // employee_profile ids of the viewer's direct reports
}

export async function getViewerScope(
  supabase: Supabase,
  orgId: string,
  userId: string,
): Promise<ViewerScope> {
  const [{ data: member }, { data: me }] = await Promise.all([
    supabase
      .from('org_members')
      .select('role, is_active')
      .eq('org_id', orgId)
      .eq('user_id', userId)
      .maybeSingle(),
    supabase
      .from('employee_profiles')
      .select('id')
      .eq('org_id', orgId)
      .eq('user_id', userId)
      .in('status', ['pending', 'active'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  const memberRow = member as { role: string; is_active: boolean } | null
  const employeeId = (me as { id: string } | null)?.id ?? null

  let reportIds = new Set<string>()
  if (employeeId) {
    const { data: reports } = await supabase
      .from('employee_profiles')
      .select('id')
      .eq('org_id', orgId)
      .eq('manager_id', employeeId)
    reportIds = new Set((reports ?? []).map(r => (r as { id: string }).id))
  }

  return {
    isAdmin:    memberRow?.is_active === true && memberRow?.role === 'admin',
    employeeId,
    reportIds,
  }
}

/** True when the viewer may see this employee at all (admin / self / manager). */
export function canViewEmployee(scope: ViewerScope, targetEmployeeId: string): boolean {
  if (scope.isAdmin) return true
  if (scope.employeeId === targetEmployeeId) return true
  if (scope.reportIds.has(targetEmployeeId)) return true
  return false
}

/** True only for admin or self — used for sensitive fields (compensation). */
export function canViewSensitive(scope: ViewerScope, targetEmployeeId: string): boolean {
  if (scope.isAdmin) return true
  if (scope.employeeId === targetEmployeeId) return true
  return false
}

export function forbidden(message = 'Forbidden'): NextResponse {
  return NextResponse.json({ error: message }, { status: 403 })
}

/** Convenience: returns the 403 to return-as-is, or null if allowed. */
export function assertCanViewEmployee(
  scope: ViewerScope,
  targetEmployeeId: string,
): NextResponse | null {
  return canViewEmployee(scope, targetEmployeeId) ? null : forbidden()
}

export function assertAdmin(scope: ViewerScope): NextResponse | null {
  return scope.isAdmin ? null : forbidden('Admins only')
}

export function assertCanViewSensitive(
  scope: ViewerScope,
  targetEmployeeId: string,
): NextResponse | null {
  return canViewSensitive(scope, targetEmployeeId) ? null : forbidden()
}
