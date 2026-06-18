import { logger } from '@/lib/logger'
import type { OrgRole } from '@/lib/types/requisitions'

/**
 * Look up the role chosen by the inviter for a specific invitee.
 *
 * When an admin sends an invite via /api/onboarding/invites we attach the
 * intended role to the Clerk invitation as `public_metadata.preferred_role`.
 * Clerk does NOT propagate invitation metadata onto the resulting membership,
 * so to honour the inviter's choice we re-read it from the invitation here.
 *
 * Returns the preferred_role if found (regardless of accepted/pending state),
 * or null if the user wasn't invited (e.g., they created the org themselves)
 * or Clerk lookup fails. Callers should fall back to user-chosen role on null.
 */
export async function getInvitePreferredRole(
  orgId: string,
  email: string,
): Promise<OrgRole | null> {
  const secret = process.env.CLERK_SECRET_KEY
  if (!secret) return null

  const normalized = email.trim().toLowerCase()
  if (!normalized) return null

  // Clerk paginates; the typical org has < 100 invitations so a single page
  // is fine. If we ever exceed that, switch to status=accepted+pending filter.
  try {
    const res = await fetch(
      `https://api.clerk.com/v1/organizations/${orgId}/invitations?limit=100`,
      { headers: { Authorization: `Bearer ${secret}` }, cache: 'no-store' },
    )
    if (!res.ok) return null

    const payload = (await res.json()) as
      | { data?: ClerkInvitation[] }
      | ClerkInvitation[]
    const list = Array.isArray(payload) ? payload : payload.data ?? []

    // Prefer accepted invitations (the one that produced this membership);
    // fall back to pending if the user is mid-acceptance. Never match revoked
    // or expired invitations — a revoked invite carries stale role metadata
    // (e.g. a since-deleted role) that must not leak into the join.
    const match =
      list.find(
        i =>
          i.email_address?.toLowerCase() === normalized && i.status === 'accepted',
      ) ??
      list.find(
        i => i.email_address?.toLowerCase() === normalized && i.status === 'pending',
      )

    const role = match?.public_metadata?.preferred_role
    if (role && ROLES.has(role as OrgRole)) return role as OrgRole
    return null
  } catch (err) {
    logger.warn('[invites] preferred_role lookup failed', {
      orgId,
      err: err instanceof Error ? err.message : String(err),
    })
    return null
  }
}

const ROLES = new Set<OrgRole>(['admin', 'recruiter', 'hiring_manager', 'interviewer'])

interface ClerkInvitation {
  id?: string
  email_address?: string
  status?: 'pending' | 'accepted' | 'revoked' | 'expired'
  public_metadata?: { preferred_role?: string; rbac_role_id?: string; rbac_role_name?: string }
}

/**
 * Revoke every pending org invitation for an email. Called before sending a
 * fresh invite so a re-invite (e.g. with a different role) can't leave a stale
 * pending invitation behind — otherwise the join-time lookup could pick up the
 * old role's metadata. Best-effort: failures are logged, not thrown, so a
 * revoke hiccup doesn't block the new invite.
 */
export async function revokePendingInvitations(
  orgId: string,
  email: string,
  requestingUserId: string,
): Promise<void> {
  const secret = process.env.CLERK_SECRET_KEY
  if (!secret) return

  const normalized = email.trim().toLowerCase()
  if (!normalized) return

  try {
    const res = await fetch(
      `https://api.clerk.com/v1/organizations/${orgId}/invitations?limit=100&status=pending`,
      { headers: { Authorization: `Bearer ${secret}` }, cache: 'no-store' },
    )
    if (!res.ok) return

    const payload = (await res.json()) as { data?: ClerkInvitation[] } | ClerkInvitation[]
    const list = Array.isArray(payload) ? payload : payload.data ?? []
    const stale = list.filter(
      i => i.email_address?.toLowerCase() === normalized && i.id,
    )

    await Promise.all(
      stale.map(i =>
        fetch(
          `https://api.clerk.com/v1/organizations/${orgId}/invitations/${i.id}/revoke`,
          {
            method: 'POST',
            headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ requesting_user_id: requestingUserId }),
          },
        ).catch(err =>
          logger.warn('[invites] revoke failed', {
            orgId,
            invitationId: i.id,
            err: err instanceof Error ? err.message : String(err),
          }),
        ),
      ),
    )
  } catch (err) {
    logger.warn('[invites] revoke pending lookup failed', {
      orgId,
      err: err instanceof Error ? err.message : String(err),
    })
  }
}

/**
 * The RBAC role the inviter chose for this invitee (Settings → team invite
 * stamps `rbac_role_id`/`rbac_role_name` on the Clerk invitation). Mirrors
 * getInvitePreferredRole. Returns null if the user wasn't invited with an RBAC
 * role (e.g. they created the org, or came via the legacy onboarding invite).
 */
export async function getInviteRbacRole(
  orgId: string,
  email: string,
): Promise<{ roleId: string; roleName: string } | null> {
  const secret = process.env.CLERK_SECRET_KEY
  if (!secret) return null

  const normalized = email.trim().toLowerCase()
  if (!normalized) return null

  try {
    const res = await fetch(
      `https://api.clerk.com/v1/organizations/${orgId}/invitations?limit=100`,
      { headers: { Authorization: `Bearer ${secret}` }, cache: 'no-store' },
    )
    if (!res.ok) return null

    const payload = (await res.json()) as { data?: ClerkInvitation[] } | ClerkInvitation[]
    const list = Array.isArray(payload) ? payload : payload.data ?? []

    const match =
      list.find(i => i.email_address?.toLowerCase() === normalized && i.status === 'accepted') ??
      list.find(i => i.email_address?.toLowerCase() === normalized && i.status === 'pending')

    const roleId = match?.public_metadata?.rbac_role_id
    if (roleId) return { roleId, roleName: match?.public_metadata?.rbac_role_name ?? '' }
    return null
  } catch (err) {
    logger.warn('[invites] rbac_role lookup failed', {
      orgId,
      err: err instanceof Error ? err.message : String(err),
    })
    return null
  }
}
