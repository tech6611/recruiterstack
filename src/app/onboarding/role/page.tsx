import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/server'
import { getOrgId, resolveUserIdFromClerk } from '@/lib/auth'
import { resolveEffectiveRole, stepsForRole } from '@/lib/onboarding/steps'
import { getInvitePreferredRole } from '@/lib/clerk/invites'
import { OnboardingShell } from '@/components/onboarding/OnboardingShell'
import { RoleForm } from '@/components/onboarding/forms/RoleForm'
import type { OrgRole } from '@/lib/types/requisitions'

export default async function RoleStepPage() {
  const { userId: clerkUserId } = auth()
  const orgId = await getOrgId()
  if (!clerkUserId || !orgId) redirect('/sign-in')

  const userId = await resolveUserIdFromClerk(clerkUserId)
  const role   = await resolveEffectiveRole(orgId, userId)
  const steps  = stepsForRole(role)

  // Detect if any admin exists for this org — drives "force admin" in the form.
  const supabase = createAdminClient()
  const { data: adminRows } = await supabase
    .from('org_members')
    .select('user_id')
    .eq('org_id', orgId)
    .eq('role', 'admin')
    .eq('is_active', true)
  const forceAdmin = (adminRows ?? []).length === 0

  const { data: mine } = await supabase
    .from('org_members')
    .select('role')
    .eq('org_id', orgId)
    .eq('user_id', userId)
    .maybeSingle()
  const defaultRole = (mine as { role: OrgRole } | null)?.role

  // Honor the role chosen by whoever invited this user. If a preferred_role
  // is on the invitation, the form is locked to it (server enforces too).
  // First org member can't be invited, so skip the lookup.
  let lockedRole: OrgRole | undefined
  if (!forceAdmin) {
    const { data: meUser } = await supabase
      .from('users')
      .select('email')
      .eq('id', userId)
      .maybeSingle()
    const email = (meUser as { email: string } | null)?.email
    if (email) {
      lockedRole = (await getInvitePreferredRole(orgId, email)) ?? undefined
    }
  }

  return (
    <OnboardingShell
      steps={steps}
      currentSlug="role"
      title="Your role"
      description="How do you plan to use RecruiterStack?"
    >
      <RoleForm forceAdmin={forceAdmin} defaultRole={defaultRole} lockedRole={lockedRole} />
    </OnboardingShell>
  )
}
