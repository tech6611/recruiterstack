import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireCapability } from '@/lib/auth-admin'
import { parseBody } from '@/lib/api/helpers'
import { teamInviteSchema } from '@/lib/validations/team'
import { revokePendingInvitations } from '@/lib/clerk/invites'
import { logger } from '@/lib/logger'

// POST /api/team/invite — requires settings:edit. Sends Clerk org invitations
// carrying the chosen RBAC role (rbac_role_id) in public_metadata; the role is
// assigned on join (ensureDefaultMemberRole → getInviteRbacRole). The Owner role
// maps to Clerk org:admin, every other role to org:member. Batch up to 10;
// per-invite failures are reported but don't fail the batch.
export async function POST(req: NextRequest) {
  const authResult = await requireCapability('settings:edit')
  if (authResult instanceof NextResponse) return authResult
  const { orgId, clerkUserId } = authResult

  const body = await parseBody(req, teamInviteSchema)
  if (body instanceof NextResponse) return body

  const secret = process.env.CLERK_SECRET_KEY
  if (!secret) {
    logger.error('[team-invite] CLERK_SECRET_KEY not set')
    return NextResponse.json({ error: 'Invitations are not configured' }, { status: 500 })
  }

  const supabase = createAdminClient()
  const results: Array<{ email: string; ok: boolean; error?: string }> = []
  for (const invite of body.invites) {
    try {
      // Resolve the chosen RBAC role (org-scoped) → name + is_owner for the
      // Clerk membership-tier mapping and the join-time assignment.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: role } = await (supabase as any)
        .from('rbac_roles')
        .select('id, name, is_owner')
        .eq('org_id', orgId)
        .eq('id', invite.roleId)
        .maybeSingle()
      const r = role as { id: string; name: string; is_owner: boolean } | null
      if (!r) {
        results.push({ email: invite.email, ok: false, error: 'Unknown role' })
        continue
      }

      // Clear any prior pending invite for this email first, so re-inviting
      // (often with a different role) doesn't leave a stale invitation whose
      // metadata could win the join-time role lookup.
      await revokePendingInvitations(orgId, invite.email, clerkUserId)

      const res = await fetch(`https://api.clerk.com/v1/organizations/${orgId}/invitations`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email_address:  invite.email,
          inviter_user_id: clerkUserId,
          role: r.is_owner ? 'org:admin' : 'org:member',
          public_metadata: {
            rbac_role_id:   r.id,
            rbac_role_name: r.name,
            // Back-compat with the onboarding bootstrap (getInvitePreferredRole).
            preferred_role: r.is_owner ? 'admin' : 'recruiter',
          },
          // Without redirect_url, Clerk lands invitees on its hosted
          // default-redirect page (esp. on dev instances) instead of returning
          // them to the app. Always send them to /sign-up where the invitation
          // ticket is auto-consumed and they continue into onboarding.
          redirect_url: `${process.env.NEXT_PUBLIC_APP_URL}/sign-up`,
        }),
      })
      if (!res.ok) {
        const text = await res.text()
        logger.warn('[team-invite] Clerk returned non-ok', { email: invite.email, status: res.status, body: text })
        results.push({ email: invite.email, ok: false, error: `Clerk returned ${res.status}` })
        continue
      }
      results.push({ email: invite.email, ok: true })
    } catch (err) {
      logger.error('[team-invite] request errored', err, { email: invite.email })
      results.push({ email: invite.email, ok: false, error: err instanceof Error ? err.message : 'Unknown' })
    }
  }

  return NextResponse.json({ ok: true, results })
}
