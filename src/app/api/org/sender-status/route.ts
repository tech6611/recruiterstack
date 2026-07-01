import { NextResponse } from 'next/server'
import { withOrg } from '@/lib/api/helpers'

/**
 * GET /api/org/sender-status
 *
 * Reports which address candidate emails are actually sent from, and whether
 * this org has verified its own sending domain. Until per-org verified sending
 * ships, every org falls back to the shared platform address, so `verified` is
 * always false here. This is the seam the domain-verification feature fills in
 * later — the compose UI reads it to warn users when they're on the fallback.
 */
export const GET = withOrg(async () => {
  const fromEmail = process.env.SENDGRID_FROM_EMAIL ?? 'no-reply@recruiterstack.in'
  return NextResponse.json({
    data: {
      verified: false,
      fromEmail,
      domain: null as string | null,
    },
  })
})
