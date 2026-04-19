import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireOnboardingContext, ensureMemberRow } from '@/lib/onboarding/server'

// POST /api/onboarding/complete — stamps onboarded_at on the member row.
// Idempotent: writing twice is harmless.
export async function POST() {
  const ctx = await requireOnboardingContext()
  if (ctx instanceof NextResponse) return ctx

  await ensureMemberRow(ctx)

  const supabase = createAdminClient()
  const { error } = await supabase
    .from('org_members')
    .update({ onboarded_at: new Date().toISOString() })
    .eq('org_id', ctx.orgId)
    .eq('user_id', ctx.userId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, next: '/dashboard' })
}
