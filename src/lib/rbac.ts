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
import {
  type Capability,
  type CapabilityOverride,
  resolveCapabilities,
} from '@/lib/permissions'

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

// ── Per-member RBAC (Slice 0) ───────────────────────────────────────────────
// Capability resolution over the roles / overrides model (migration 065).
// Standalone for now — NOT yet wired into getViewerScope or any route. Slice 1
// turns these into enforcement. The casts on `.from(...)` are because the new
// tables aren't in the generated Database type yet (formalize via gen:types).

/**
 * Effective capability set for a member: union of assigned-role capabilities,
 * plus per-member allow/deny overrides; Owner roles grant everything.
 * See `resolveCapabilities` in src/lib/permissions.ts for the precedence rules.
 */
export async function getPermissionSet(
  supabase: Supabase,
  orgId: string,
  userId: string,
): Promise<Set<Capability>> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any

  const { data: assigned } = await sb
    .from('rbac_member_roles')
    .select('role_id')
    .eq('org_id', orgId)
    .eq('user_id', userId)
  const roleIds = ((assigned ?? []) as Array<{ role_id: string }>).map(r => r.role_id)

  let isOwner = false
  let roleCapabilities: string[] = []
  if (roleIds.length > 0) {
    const [{ data: roles }, { data: caps }] = await Promise.all([
      sb.from('rbac_roles').select('is_owner').eq('org_id', orgId).in('id', roleIds),
      sb.from('rbac_role_capabilities').select('capability').in('role_id', roleIds),
    ])
    isOwner = ((roles ?? []) as Array<{ is_owner: boolean }>).some(r => r.is_owner)
    roleCapabilities = ((caps ?? []) as Array<{ capability: string }>).map(c => c.capability)
  }

  const { data: overrides } = await sb
    .from('rbac_member_overrides')
    .select('capability, effect')
    .eq('org_id', orgId)
    .eq('user_id', userId)

  return resolveCapabilities({
    isOwner,
    roleCapabilities,
    overrides: (overrides ?? []) as CapabilityOverride[],
  })
}

export function can(capabilities: Set<Capability>, capability: Capability): boolean {
  return capabilities.has(capability)
}

/** Convenience: returns the 403 to return-as-is, or null if allowed. */
export function assertCan(
  capabilities: Set<Capability>,
  capability: Capability,
): NextResponse | null {
  return capabilities.has(capability) ? null : forbidden(`Missing permission: ${capability}`)
}
