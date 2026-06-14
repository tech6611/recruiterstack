/**
 * RBAC management facade (Slice 4) — CRUD over the `rbac_*` tables (migration
 * 065): roles + their capabilities, member→role assignments, and per-member
 * capability overrides.
 *
 * Read/style mirrors `src/modules/ats/domain/applications.ts`: every function
 * takes a typed Supabase client plus `orgId`, and returns plain data (no
 * NextResponse, no auth). The new `rbac_*` tables aren't in the generated
 * Database type yet, so we cast the client (`supabase as any`) per-call — the
 * same pattern used in `src/lib/rbac.ts`.
 *
 * System roles ('Owner' is_owner=true, 'Recruiter') are seeded per org and are
 * read-only in v1: `updateRole`/`deleteRole` reject them. Only custom roles
 * (is_system=false) are editable/deletable.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'
import { type Capability, isCapability } from '@/lib/permissions'

type Supabase = SupabaseClient<Database>

export interface RoleWithCapabilities {
  id: string
  name: string
  description: string | null
  is_system: boolean
  is_owner: boolean
  capabilities: string[]
}

export interface RoleRow {
  id: string
  org_id: string
  name: string
  description: string | null
  is_system: boolean
  is_owner: boolean
}

export interface MemberWithRoles {
  user_id: string
  name: string
  email: string | null
  org_role: string
  role_ids: string[]
  overrides: Array<{ capability: string; effect: string }>
}

/** Keep only the capability strings that exist in the registry. */
function validCapabilities(capabilities: string[] | undefined): Capability[] {
  return (capabilities ?? []).filter(isCapability)
}

// ── Roles ───────────────────────────────────────────────────────────────────

/** Every role in the org with its flattened capability strings. */
export async function listRolesWithCapabilities(
  supabase: Supabase,
  orgId: string,
): Promise<RoleWithCapabilities[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any

  const { data: roles, error } = await sb
    .from('rbac_roles')
    .select('id, name, description, is_system, is_owner')
    .eq('org_id', orgId)
    .order('is_system', { ascending: false })
    .order('name', { ascending: true })
  if (error) throw error

  const roleRows = (roles ?? []) as Array<{
    id: string
    name: string
    description: string | null
    is_system: boolean
    is_owner: boolean
  }>
  if (roleRows.length === 0) return []

  const { data: caps, error: capsError } = await sb
    .from('rbac_role_capabilities')
    .select('role_id, capability')
    .in('role_id', roleRows.map(r => r.id))
  if (capsError) throw capsError

  const byRole = new Map<string, string[]>()
  for (const c of (caps ?? []) as Array<{ role_id: string; capability: string }>) {
    const list = byRole.get(c.role_id) ?? []
    list.push(c.capability)
    byRole.set(c.role_id, list)
  }

  return roleRows.map(r => ({
    id: r.id,
    name: r.name,
    description: r.description,
    is_system: r.is_system,
    is_owner: r.is_owner,
    capabilities: byRole.get(r.id) ?? [],
  }))
}

/**
 * Create a custom role (is_system=false, is_owner=false) and its capabilities.
 * Capabilities are validated against the registry; unknown strings are dropped.
 * Returns the created role row.
 */
export async function createRole(
  supabase: Supabase,
  orgId: string,
  input: { name: string; description?: string | null; capabilities?: string[] },
): Promise<RoleRow> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any

  const { data: role, error } = await sb
    .from('rbac_roles')
    .insert({
      org_id: orgId,
      name: input.name,
      description: input.description ?? null,
      is_system: false,
      is_owner: false,
    })
    .select('id, org_id, name, description, is_system, is_owner')
    .single()
  if (error) throw error

  const created = role as RoleRow

  const caps = validCapabilities(input.capabilities)
  if (caps.length > 0) {
    const { error: capsError } = await sb
      .from('rbac_role_capabilities')
      .insert(caps.map(capability => ({ role_id: created.id, capability })))
    if (capsError) throw capsError
  }

  return created
}

/**
 * Update a custom role's name/description and/or replace its capability set.
 * Rejects system roles (returns null). When `capabilities` is provided, the
 * role's capability set is fully replaced; omit it to leave caps untouched.
 * Returns the updated role row, or null if not found / system.
 */
export async function updateRole(
  supabase: Supabase,
  orgId: string,
  roleId: string,
  input: { name?: string; description?: string | null; capabilities?: string[] },
): Promise<RoleRow | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any

  const { data: existing } = await sb
    .from('rbac_roles')
    .select('id, is_system')
    .eq('org_id', orgId)
    .eq('id', roleId)
    .maybeSingle()
  const row = existing as { id: string; is_system: boolean } | null
  if (!row || row.is_system) return null

  const patch: Record<string, unknown> = {}
  if (input.name !== undefined) patch.name = input.name
  if (input.description !== undefined) patch.description = input.description

  let updated: RoleRow
  if (Object.keys(patch).length > 0) {
    const { data, error } = await sb
      .from('rbac_roles')
      .update(patch)
      .eq('org_id', orgId)
      .eq('id', roleId)
      .select('id, org_id, name, description, is_system, is_owner')
      .single()
    if (error) throw error
    updated = data as RoleRow
  } else {
    const { data, error } = await sb
      .from('rbac_roles')
      .select('id, org_id, name, description, is_system, is_owner')
      .eq('org_id', orgId)
      .eq('id', roleId)
      .single()
    if (error) throw error
    updated = data as RoleRow
  }

  if (input.capabilities !== undefined) {
    const { error: delError } = await sb
      .from('rbac_role_capabilities')
      .delete()
      .eq('role_id', roleId)
    if (delError) throw delError

    const caps = validCapabilities(input.capabilities)
    if (caps.length > 0) {
      const { error: insError } = await sb
        .from('rbac_role_capabilities')
        .insert(caps.map(capability => ({ role_id: roleId, capability })))
      if (insError) throw insError
    }
  }

  return updated
}

/**
 * Delete a custom role. Rejects system roles (returns false). The DB cascades
 * clear its capabilities and member assignments. Returns true if deleted.
 */
export async function deleteRole(
  supabase: Supabase,
  orgId: string,
  roleId: string,
): Promise<boolean> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any

  const { data: existing } = await sb
    .from('rbac_roles')
    .select('id, is_system')
    .eq('org_id', orgId)
    .eq('id', roleId)
    .maybeSingle()
  const row = existing as { id: string; is_system: boolean } | null
  if (!row || row.is_system) return false

  const { error } = await sb
    .from('rbac_roles')
    .delete()
    .eq('org_id', orgId)
    .eq('id', roleId)
  if (error) throw error

  return true
}

// ── Members ──────────────────────────────────────────────────────────────────

/**
 * Every active org member with their display name/email (from `users`), their
 * org_members.role, assigned RBAC role ids, and per-member overrides.
 */
export async function listMembersWithRoles(
  supabase: Supabase,
  orgId: string,
): Promise<MemberWithRoles[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any

  const { data: members, error } = await sb
    .from('org_members')
    .select('user_id, role, is_active, user:users(id, first_name, last_name, full_name, email)')
    .eq('org_id', orgId)
    .eq('is_active', true)
  if (error) throw error

  const memberRows = (members ?? []) as Array<{
    user_id: string
    role: string
    user: {
      id: string
      first_name: string | null
      last_name: string | null
      full_name: string | null
      email: string | null
    } | null
  }>
  if (memberRows.length === 0) return []

  const userIds = memberRows.map(m => m.user_id)

  const [{ data: roleLinks }, { data: overrides }] = await Promise.all([
    sb.from('rbac_member_roles').select('user_id, role_id').eq('org_id', orgId).in('user_id', userIds),
    sb.from('rbac_member_overrides').select('user_id, capability, effect').eq('org_id', orgId).in('user_id', userIds),
  ])

  const rolesByUser = new Map<string, string[]>()
  for (const link of (roleLinks ?? []) as Array<{ user_id: string; role_id: string }>) {
    const list = rolesByUser.get(link.user_id) ?? []
    list.push(link.role_id)
    rolesByUser.set(link.user_id, list)
  }

  const overridesByUser = new Map<string, Array<{ capability: string; effect: string }>>()
  for (const o of (overrides ?? []) as Array<{ user_id: string; capability: string; effect: string }>) {
    const list = overridesByUser.get(o.user_id) ?? []
    list.push({ capability: o.capability, effect: o.effect })
    overridesByUser.set(o.user_id, list)
  }

  return memberRows.map(m => {
    const u = m.user
    const name =
      u?.full_name?.trim() ||
      [u?.first_name, u?.last_name].filter(Boolean).join(' ').trim() ||
      u?.email ||
      m.user_id
    return {
      user_id: m.user_id,
      name,
      email: u?.email ?? null,
      org_role: m.role,
      role_ids: rolesByUser.get(m.user_id) ?? [],
      overrides: overridesByUser.get(m.user_id) ?? [],
    }
  })
}

/** Assign an RBAC role to a member (idempotent upsert on the PK). */
export async function assignRole(
  supabase: Supabase,
  orgId: string,
  userId: string,
  roleId: string,
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any

  const { error } = await sb
    .from('rbac_member_roles')
    .upsert(
      { org_id: orgId, user_id: userId, role_id: roleId },
      { onConflict: 'org_id,user_id,role_id', ignoreDuplicates: true },
    )
  if (error) throw error
}

/** Remove an RBAC role from a member (idempotent delete). */
export async function unassignRole(
  supabase: Supabase,
  orgId: string,
  userId: string,
  roleId: string,
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any

  const { error } = await sb
    .from('rbac_member_roles')
    .delete()
    .eq('org_id', orgId)
    .eq('user_id', userId)
    .eq('role_id', roleId)
  if (error) throw error
}

/**
 * Set a per-member allow/deny override for one capability (idempotent upsert on
 * the PK). The capability must exist in the registry, else this is a no-op.
 */
export async function setMemberOverride(
  supabase: Supabase,
  orgId: string,
  userId: string,
  capability: string,
  effect: 'allow' | 'deny',
): Promise<void> {
  if (!isCapability(capability)) return

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any

  const { error } = await sb
    .from('rbac_member_overrides')
    .upsert(
      { org_id: orgId, user_id: userId, capability, effect },
      { onConflict: 'org_id,user_id,capability' },
    )
  if (error) throw error
}

/** Clear a per-member capability override (idempotent delete). */
export async function clearMemberOverride(
  supabase: Supabase,
  orgId: string,
  userId: string,
  capability: string,
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any

  const { error } = await sb
    .from('rbac_member_overrides')
    .delete()
    .eq('org_id', orgId)
    .eq('user_id', userId)
    .eq('capability', capability)
  if (error) throw error
}
