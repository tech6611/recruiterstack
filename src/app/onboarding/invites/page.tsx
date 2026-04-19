import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { resolveUserIdFromClerk } from '@/lib/auth'
import { resolveEffectiveRole, stepsForRole, nextStep } from '@/lib/onboarding/steps'
import { OnboardingShell } from '@/components/onboarding/OnboardingShell'
import { InvitesForm } from '@/components/onboarding/forms/InvitesForm'

export default async function InvitesStepPage() {
  const { userId: clerkUserId, orgId } = auth()
  if (!clerkUserId || !orgId) redirect('/sign-in')

  const userId = await resolveUserIdFromClerk(clerkUserId)
  const role   = await resolveEffectiveRole(orgId, userId)
  if (role === 'member') {
    const next = nextStep('role', role)
    redirect(next ? `/onboarding/${next}` : '/dashboard')
  }

  const steps = stepsForRole(role)
  return (
    <OnboardingShell
      steps={steps}
      currentSlug="invites"
      title="Invite teammates"
      description="Optional — add the people who'll hire with you. We'll email each an invite link."
    >
      <InvitesForm />
    </OnboardingShell>
  )
}
