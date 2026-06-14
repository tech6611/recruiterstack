/**
 * Shared server helpers for onboarding API routes.
 * - ensureMemberRow: upserts org_members so subsequent writes have a target
 * - Wraps the common auth boilerplate
 */

import { NextResponse } from 'next/server'
import { requireOrgAndUser } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'
import { ensureDefaultMemberRole } from '@/lib/rbac'
import type { EffectiveRole } from '@/lib/onboarding/steps'

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
  // Give the new member their default RBAC role so they aren't locked out once
  // capability enforcement is on (admin → Owner, else Recruiter). Idempotent.
  await ensureDefaultMemberRole(supabase, ctx.orgId, ctx.userId)
}

/**
 * Have the steps that gate access to the app actually been completed?
 *
 * Completion is inferred from persisted data, not from reaching the cosmetic
 * "done" screen — that screen's client-side stamp was the original bug (users
 * connected Slack mid-onboarding, bounced back to the integrations step, and
 * left without ever hitting "done", so onboarded_at stayed null forever).
 *
 *  - profile  → users.first_name is set (profileSchema requires it).
 *  - org-info → org_settings.company_name is set (admins only).
 *  - modules  → org_settings.enabled_agents has ≥1 entry (admins only).
 *
 * The role and invites steps have no reliable required-data signal (role
 * defaults to 'recruiter'; invites are optional), so they aren't gated on here.
 */
export async function requiredStepsComplete(
  orgId: string,
  userId: string,
  role: EffectiveRole,
): Promise<boolean> {
  const supabase = createAdminClient()

  const { data: user } = await supabase
    .from('users')
    .select('first_name')
    .eq('id', userId)
    .maybeSingle()
  if (!(user as { first_name: string | null } | null)?.first_name) return false

  const isAdmin = role === 'admin' || role === 'pending-admin'
  if (isAdmin) {
    const { data: settings } = await supabase
      .from('org_settings')
      .select('company_name, enabled_agents')
      .eq('org_id', orgId)
      .maybeSingle()
    const s = settings as { company_name: string | null; enabled_agents: string[] | null } | null
    if (!s?.company_name) return false
    if (!s.enabled_agents || s.enabled_agents.length === 0) return false
  }

  return true
}

/**
 * Idempotently stamp onboarded_at. Only writes when currently null so the
 * original completion time is preserved across repeat calls (page reloads,
 * the done-step backstop, etc.). Safe to call from any server context.
 */
export async function markOnboarded(orgId: string, userId: string): Promise<void> {
  const supabase = createAdminClient()
  await supabase
    .from('org_members')
    .update({ onboarded_at: new Date().toISOString() })
    .eq('org_id', orgId)
    .eq('user_id', userId)
    .is('onboarded_at', null)
}
