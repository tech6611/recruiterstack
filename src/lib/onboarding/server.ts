/**
 * Shared server helpers for onboarding API routes.
 * - ensureMemberRow: upserts org_members so subsequent writes have a target
 * - Wraps the common auth boilerplate
 */

import { NextResponse } from 'next/server'
import { requireOrgAndUser } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'

export interface OnboardingContext {
  orgId: string
  userId: string
  clerkUserId: string
}

export async function requireOnboardingContext(): Promise<OnboardingContext | NextResponse> {
  const auth = await requireOrgAndUser()
  if (auth instanceof NextResponse) return auth
  return auth
}

/**
 * Idempotently ensure an org_members row exists for this user.
 * Called at the start of every onboarding step so we always have somewhere
 * to write role/onboarded_at without extra existence checks.
 */
export async function ensureMemberRow(ctx: OnboardingContext): Promise<void> {
  const supabase = createAdminClient()
  await supabase
    .from('org_members')
    .upsert(
      { org_id: ctx.orgId, user_id: ctx.userId, role: 'recruiter' },
      { onConflict: 'org_id,user_id', ignoreDuplicates: true },
    )
}
