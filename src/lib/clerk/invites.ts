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
    // fall back to pending if the user is mid-acceptance.
    const match =
      list.find(
        i =>
          i.email_address?.toLowerCase() === normalized && i.status === 'accepted',
      ) ??
      list.find(i => i.email_address?.toLowerCase() === normalized)

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
  email_address?: string
  status?: 'pending' | 'accepted' | 'revoked' | 'expired'
  public_metadata?: { preferred_role?: string }
}
