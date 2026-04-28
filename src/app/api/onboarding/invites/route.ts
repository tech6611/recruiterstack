import { NextRequest, NextResponse } from 'next/server'
import { parseBody } from '@/lib/api/helpers'
import { invitesSchema } from '@/lib/validations/onboarding-invites'
import { requireOnboardingContext, ensureMemberRow } from '@/lib/onboarding/server'
import { resolveEffectiveRole, nextStep } from '@/lib/onboarding/steps'
import { logger } from '@/lib/logger'

/**
 * Creates Clerk org invitations, carrying our intended role in public_metadata.
 * We swallow per-invite failures (log them and continue) so one bad address
 * doesn't kill the whole batch.
 */
export async function POST(req: NextRequest) {
  const ctx = await requireOnboardingContext()
  if (ctx instanceof NextResponse) return ctx

  const body = await parseBody(req, invitesSchema)
  if (body instanceof NextResponse) return body

  await ensureMemberRow(ctx)

  const role = await resolveEffectiveRole(ctx.orgId, ctx.userId)
  if (role === 'member') {
    return NextResponse.json({ error: 'Only admins can invite teammates' }, { status: 403 })
  }

  const secret = process.env.CLERK_SECRET_KEY
  if (!secret) {
    logger.error('[invites] CLERK_SECRET_KEY not set')
    return NextResponse.json({ error: 'Invitations are not configured' }, { status: 500 })
  }

  const results: Array<{ email: string; ok: boolean; error?: string }> = []

  for (const invite of body.invites) {
    try {
      const res = await fetch(`https://api.clerk.com/v1/organizations/${ctx.orgId}/invitations`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${secret}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email_address:  invite.email,
          inviter_user_id: ctx.clerkUserId,
          // Clerk expects 'org:admin' or 'org:member' for its own role model.
          role: invite.role === 'admin' ? 'org:admin' : 'org:member',
          public_metadata: { preferred_role: invite.role },
          // Send invitees back to our /sign-up so the ticket is consumed and
          // they continue into onboarding, instead of Clerk's default-redirect
          // landing page on dev instances.
          redirect_url: `${process.env.NEXT_PUBLIC_APP_URL}/sign-up`,
        }),
      })

      if (!res.ok) {
        const text = await res.text()
        logger.warn('[invites] Clerk invitation failed', { email: invite.email, status: res.status, body: text })
        results.push({ email: invite.email, ok: false, error: `Clerk returned ${res.status}` })
        continue
      }
      results.push({ email: invite.email, ok: true })
    } catch (err) {
      logger.error('[invites] invitation request errored', err, { email: invite.email })
      results.push({ email: invite.email, ok: false, error: err instanceof Error ? err.message : 'Unknown' })
    }
  }

  const next = nextStep('invites', role)
  return NextResponse.json({
    ok: true,
    next: next ? `/onboarding/${next}` : '/dashboard',
    results,
  })
}
