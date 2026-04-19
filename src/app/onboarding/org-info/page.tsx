import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/server'
import { resolveUserIdFromClerk } from '@/lib/auth'
import { resolveEffectiveRole, stepsForRole, nextStep } from '@/lib/onboarding/steps'
import { OnboardingShell } from '@/components/onboarding/OnboardingShell'
import { OrgInfoForm } from '@/components/onboarding/forms/OrgInfoForm'
import type { CompanySize } from '@/lib/types/database'

export default async function OrgInfoStepPage() {
  const { userId: clerkUserId, orgId } = auth()
  if (!clerkUserId || !orgId) redirect('/sign-in')

  const userId = await resolveUserIdFromClerk(clerkUserId)
  const role   = await resolveEffectiveRole(orgId, userId)
  // Non-admin skips to next applicable step.
  if (role === 'member') {
    const next = nextStep('role', role)
    redirect(next ? `/onboarding/${next}` : '/dashboard')
  }

  const steps = stepsForRole(role)
  const supabase = createAdminClient()
  const { data: settings } = await supabase
    .from('org_settings')
    .select('company_name, company_size, industry, website')
    .eq('org_id', orgId)
    .maybeSingle()

  const defaults = (settings ?? {}) as {
    company_name?: string | null
    company_size?: CompanySize | null
    industry?:     string | null
    website?:      string | null
  }

  return (
    <OnboardingShell
      steps={steps}
      currentSlug="org-info"
      title="About your team"
      description="A few basics so we can tailor the experience."
    >
      <OrgInfoForm defaults={{
        company_name: defaults.company_name ?? '',
        company_size: defaults.company_size ?? undefined,
        industry:     defaults.industry ?? '',
        website:      defaults.website ?? '',
      }} />
    </OnboardingShell>
  )
}
