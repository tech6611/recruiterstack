import { createAdminClient } from '@/lib/supabase/server'
import { logger } from '@/lib/logger'

/**
 * Clerk → RecruiterStack user sync.
 *
 * These helpers are pure data plumbing. They are the single source of truth
 * for how a Clerk event (or a Clerk Management API object) maps into our
 * users / org_members tables.
 *
 * Two callers:
 *  1. The webhook endpoint (src/app/api/webhooks/clerk/route.ts) — real time.
 *  2. The backfill CLI (scripts/backfill-clerk.ts) — one-shot for existing
 *     users created before the webhook was wired up.
 *
 * Business logic (e.g., bootstrapping the first admin of a new org) lives
 * in the onboarding flow, NOT here. These functions do faithful sync only.
 */

// ── Input shapes (subsets of Clerk's types — we don't need everything) ──

export interface ClerkUserPayload {
  id: string                                // clerk_user_id
  email_addresses: Array<{ id: string; email_address: string }>
  primary_email_address_id: string | null
  first_name: string | null
  last_name: string | null
  image_url: string | null
}

export interface ClerkMembershipPayload {
  organization: { id: string }
  public_user_data: { user_id: string }     // clerk_user_id
  role: string                              // Clerk's role string, e.g., 'org:admin', 'admin', 'basic_member'
}

// ── User sync ────────────────────────────────────────────────

/**
 * Upsert a Clerk user into our users table. Idempotent on clerk_user_id.
 * Returns the upserted row's id (our internal UUID).
 */
export async function syncUserFromClerk(clerkUser: ClerkUserPayload): Promise<string> {
  const supabase = createAdminClient()

  const primaryEmail = clerkUser.email_addresses.find(e => e.id === clerkUser.primary_email_address_id)
    ?? clerkUser.email_addresses[0]

  if (!primaryEmail) {
    throw new Error(`Clerk user ${clerkUser.id} has no email address`)
  }

  const full_name = [clerkUser.first_name, clerkUser.last_name].filter(Boolean).join(' ') || null

  const { data, error } = await supabase
    .from('users')
    .upsert(
      {
        clerk_user_id: clerkUser.id,
        email: primaryEmail.email_address,
        first_name: clerkUser.first_name,
        last_name: clerkUser.last_name,
        full_name,
        avatar_url: clerkUser.image_url,
      },
      { onConflict: 'clerk_user_id' },
    )
    .select('id')
    .single()

  if (error || !data) {
    logger.error('Failed to sync user from Clerk', error, { clerkUserId: clerkUser.id })
    throw error ?? new Error('User upsert returned no row')
  }

  return data.id
}

/**
 * Mark a user deactivated. We never hard-delete — audit trails reference users.id.
 */
export async function deactivateUser(clerkUserId: string): Promise<void> {
  const supabase = createAdminClient()
  const { error } = await supabase
    .from('users')
    .update({ deactivated_at: new Date().toISOString() })
    .eq('clerk_user_id', clerkUserId)

  if (error) {
    logger.error('Failed to deactivate user', error, { clerkUserId })
    throw error
  }
}

// ── Membership sync ──────────────────────────────────────────

/**
 * Map Clerk's role string to our role enum.
 * Clerk roles: 'org:admin' | 'org:member' (v2) or 'admin' | 'basic_member' (legacy).
 * We collapse everything to 'recruiter' by default; onboarding promotes the
 * first user per org to 'admin'.
 */
function mapClerkRole(clerkRole: string): 'recruiter' {
  // Always return 'recruiter' on sync. Bootstrap-admin is an onboarding-flow
  // concern; explicit role changes happen via the admin UI (Phase D+).
  // Keeping this centralized so future role imports have one place to change.
  void clerkRole
  return 'recruiter'
}

/**
 * Upsert an org membership. Idempotent on (org_id, user_id).
 * Requires the user to already exist in users (call syncUserFromClerk first).
 */
export async function syncMembershipFromClerk(membership: ClerkMembershipPayload): Promise<void> {
  const supabase = createAdminClient()

  const { data: user, error: userErr } = await supabase
    .from('users')
    .select('id')
    .eq('clerk_user_id', membership.public_user_data.user_id)
    .single()

  if (userErr || !user) {
    throw new Error(
      `Cannot sync membership: user ${membership.public_user_data.user_id} not found in users. Call syncUserFromClerk first.`,
    )
  }

  const { error } = await supabase
    .from('org_members')
    .upsert(
      {
        org_id: membership.organization.id,
        user_id: user.id,
        role: mapClerkRole(membership.role),
        is_active: true,
      },
      { onConflict: 'org_id,user_id' },
    )

  if (error) {
    logger.error('Failed to sync membership from Clerk', error, {
      orgId: membership.organization.id,
      clerkUserId: membership.public_user_data.user_id,
    })
    throw error
  }
}

/**
 * Deactivate a membership (user left an org). Preserves the row for audit.
 */
export async function deactivateMembership(orgId: string, clerkUserId: string): Promise<void> {
  const supabase = createAdminClient()

  const { data: user } = await supabase
    .from('users')
    .select('id')
    .eq('clerk_user_id', clerkUserId)
    .single()

  if (!user) return

  const { error } = await supabase
    .from('org_members')
    .update({ is_active: false })
    .eq('org_id', orgId)
    .eq('user_id', user.id)

  if (error) {
    logger.error('Failed to deactivate membership', error, { orgId, clerkUserId })
    throw error
  }
}
