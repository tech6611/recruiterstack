/**
 * Team / org-membership facade (migration 090) — the org_members provisioning
 * layer. Its headline job is `provisionHiringManagerSeat`: when someone names a
 * hiring manager as an approver, we mint a real `users` + `org_members` row for
 * that person *synchronously*, so the approval engine always has a concrete
 * `user_id` to target — even before they've accepted a Clerk login.
 *
 * Two facts make this safe:
 *   - `users.clerk_user_id` is nullable (090). A row with it NULL is a "pending"
 *     user; `syncUserFromClerk` backfills the real login onto it at accept time.
 *   - hiring-manager seats are free (`org_members.is_free_seat = true`), so they
 *     never count against paid recruiter seats.
 *
 * Style mirrors the other domain facades: a typed Supabase client in, plain data
 * out, no NextResponse / no auth. The 090 columns aren't in the generated
 * Database type yet, so we cast the client per-call (`supabase as any`) exactly
 * like `src/lib/rbac.ts` does for the rbac_* tables.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'
import { ensureDefaultMemberRole } from '@/lib/rbac'
import { revokePendingInvitations } from '@/lib/clerk/invites'
import { logger } from '@/lib/logger'

type Supabase = SupabaseClient<Database>

export interface MemberByEmail {
  userId: string
  email: string
  fullName: string | null
  role: string
  isActive: boolean
}

/**
 * Resolve an *active* member of THIS org by case-insensitive email. Scoped
 * through the org_members bridge (the users table itself is global), so only
 * members of this org resolve. Returns null when there's no match.
 */
export async function getMemberByEmail(
  supabase: Supabase,
  orgId: string,
  email: string,
): Promise<MemberByEmail | null> {
  const normalized = email.trim().toLowerCase()
  if (!normalized) return null

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any
  const { data, error } = await sb
    .from('org_members')
    .select('role, is_active, users:users!inner(id, email, full_name)')
    .eq('org_id', orgId)
    .ilike('users.email', normalized)
    .maybeSingle()

  if (error) throw error
  if (!data) return null
  const u = data.users as { id: string; email: string; full_name: string | null }
  return {
    userId: u.id,
    email: u.email,
    fullName: u.full_name,
    role: data.role as string,
    isActive: data.is_active as boolean,
  }
}

/** The org_members.role for a (org, user) pair, or null if not a member. */
export async function getMemberScopeRole(
  supabase: Supabase,
  orgId: string,
  userId: string,
): Promise<string | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any
  const { data, error } = await sb
    .from('org_members')
    .select('role')
    .eq('org_id', orgId)
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw error
  return (data as { role?: string } | null)?.role ?? null
}

export interface ProvisionSeatInput {
  orgId: string
  email: string
  name?: string | null
  invitedByUserId: string
}

export interface ProvisionSeatResult {
  userId: string
  /** true when this call created the org_members seat (first-time provisioning). */
  created: boolean
}

/**
 * Idempotently ensure `email` is a hiring-manager member of `orgId`, returning
 * the user_id an approval step can target.
 *
 *   - If they're already a member of this org, short-circuit — return their
 *     user_id untouched (we never downgrade an existing recruiter/admin to
 *     hiring_manager, and we don't re-invite them).
 *   - Otherwise reuse a global `users` row for that email if one exists (they
 *     may already have a login from another org), else insert a *pending* row
 *     (clerk_user_id NULL, provisioned_via='approver_invite'). Then upsert an
 *     org_members seat (role hiring_manager, active, free), assign the default
 *     RBAC role, and fire a best-effort Clerk invitation so they can claim a
 *     real login later.
 *
 * Clerk invitation failures are swallowed: the seat + user_id already exist, so
 * approvals work regardless — the invite is only about the login upgrade.
 */
export async function provisionHiringManagerSeat(
  supabase: Supabase,
  input: ProvisionSeatInput,
): Promise<ProvisionSeatResult> {
  const { orgId, invitedByUserId } = input
  const email = input.email.trim().toLowerCase()
  const name = input.name?.trim() || null
  if (!email) throw new Error('provisionHiringManagerSeat: email is required')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any

  // 1. Already a member of THIS org? Short-circuit, untouched.
  const existingMember = await getMemberByEmail(supabase, orgId, email)
  if (existingMember) {
    return { userId: existingMember.userId, created: false }
  }

  // 2. Reuse a global users row for this email, or insert a pending one.
  const { data: existingUser, error: lookupErr } = await sb
    .from('users')
    .select('id')
    .ilike('email', email)
    .maybeSingle()
  if (lookupErr) throw lookupErr

  let userId = (existingUser as { id?: string } | null)?.id ?? null
  if (!userId) {
    const { data: inserted, error: insertErr } = await sb
      .from('users')
      .insert({
        clerk_user_id: null,
        email,
        full_name: name,
        provisioned_via: 'approver_invite',
      })
      .select('id')
      .single()
    if (insertErr) throw insertErr
    userId = (inserted as { id: string }).id
  }

  // 3. Upsert the free hiring-manager seat.
  const { error: memberErr } = await sb
    .from('org_members')
    .upsert(
      {
        org_id: orgId,
        user_id: userId,
        role: 'hiring_manager',
        is_active: true,
        is_free_seat: true,
      },
      { onConflict: 'org_id,user_id' },
    )
  if (memberErr) throw memberErr

  // 4. Default RBAC role assignment (idempotent).
  await ensureDefaultMemberRole(supabase, orgId, userId as string)

  // 5. Best-effort Clerk invitation so they can claim a login. Never blocks.
  await sendHiringManagerInvitation(orgId, email, invitedByUserId)

  return { userId: userId as string, created: true }
}

/**
 * Fire a Clerk org invitation carrying `preferred_role='hiring_manager'`, so
 * that when the person accepts, our join-time role lookup honors it. Revokes any
 * stale pending invite first (a re-pick must not leave old role metadata). All
 * failures are logged, never thrown — the seat already works without a login.
 */
async function sendHiringManagerInvitation(
  orgId: string,
  email: string,
  invitedByUserId: string,
): Promise<void> {
  const secret = process.env.CLERK_SECRET_KEY
  if (!secret) return

  try {
    await revokePendingInvitations(orgId, email, invitedByUserId)

    const res = await fetch(`https://api.clerk.com/v1/organizations/${orgId}/invitations`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email_address: email,
        // Hiring managers are always org:member in Clerk's own role model; our
        // richer role lives in public_metadata and is re-read at join time.
        role: 'org:member',
        public_metadata: { preferred_role: 'hiring_manager' },
        redirect_url: `${process.env.NEXT_PUBLIC_APP_URL}/sign-up`,
      }),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      logger.warn('[team] hiring-manager invitation failed', { orgId, email, status: res.status, body: text })
    }
  } catch (err) {
    logger.warn('[team] hiring-manager invitation errored', {
      orgId,
      email,
      err: err instanceof Error ? err.message : String(err),
    })
  }
}
