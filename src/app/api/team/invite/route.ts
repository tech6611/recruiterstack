import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireOrgAndUser } from '@/lib/auth'
import { parseBody } from '@/lib/api/helpers'
import { invitesSchema } from '@/lib/validations/onboarding-invites'
import { logger } from '@/lib/logger'

// POST /api/team/invite — admin-only. Sends Clerk org invitations with our
// preferred role in public_metadata. Batch up to 10 (shared constraint with
// onboarding). Per-invite failures are reported but don't fail the batch.
export async function POST(req: NextRequest) {
  const authResult = await requireOrgAndUser()
  if (authResult instanceof NextResponse) return authResult
  const { orgId, userId, clerkUserId } = authResult

  const supabase = createAdminClient()
  const { data: caller } = await supabase
    .from('org_members')
    .select('role')
    .eq('org_id', orgId)
    .eq('user_id', userId)
    .maybeSingle()
  if ((caller as { role: string } | null)?.role !== 'admin') {
    return NextResponse.json({ error: 'Only admins can invite teammates.' }, { status: 403 })
  }

  const body = await parseBody(req, invitesSchema)
  if (body instanceof NextResponse) return body

  const secret = process.env.CLERK_SECRET_KEY
  if (!secret) {
    logger.error('[team-invite] CLERK_SECRET_KEY not set')
    return NextResponse.json({ error: 'Invitations are not configured' }, { status: 500 })
  }

  const results: Array<{ email: string; ok: boolean; error?: string }> = []
  for (const invite of body.invites) {
    try {
      const res = await fetch(`https://api.clerk.com/v1/organizations/${orgId}/invitations`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email_address:  invite.email,
          inviter_user_id: clerkUserId,
          role: invite.role === 'admin' ? 'org:admin' : 'org:member',
          public_metadata: { preferred_role: invite.role },
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
