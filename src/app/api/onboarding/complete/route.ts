import { NextResponse } from 'next/server'
import { requireOnboardingContext, ensureMemberRow, markOnboarded } from '@/lib/onboarding/server'

// POST /api/onboarding/complete — stamps onboarded_at on the member row.
// Idempotent: markOnboarded only writes when onboarded_at is still null, so the
// original completion time is preserved if this is called more than once.
export async function POST() {
  const ctx = await requireOnboardingContext()
  if (ctx instanceof NextResponse) return ctx

  await ensureMemberRow(ctx)
  await markOnboarded(ctx.orgId, ctx.userId)

  return NextResponse.json({ ok: true, next: '/dashboard' })
}
