import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/server'
import { getOrgId, resolveUserIdFromClerk } from '@/lib/auth'
import { resolveEffectiveRole, stepsForRole } from '@/lib/onboarding/steps'
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

  return (
    <OnboardingShell
      steps={steps}
      currentSlug="role"
      title="Your role"
      description="How do you plan to use RecruiterStack?"
    >
      <RoleForm forceAdmin={forceAdmin} defaultRole={defaultRole} />
    </OnboardingShell>
  )
}
