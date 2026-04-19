import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { resolveUserIdFromClerk } from '@/lib/auth'
import { resolveEffectiveRole, stepsForRole } from '@/lib/onboarding/steps'
import { OnboardingShell } from '@/components/onboarding/OnboardingShell'
import { DoneStep } from '@/components/onboarding/forms/DoneStep'

export default async function DonePage() {
  const { userId: clerkUserId, orgId } = auth()
  if (!clerkUserId || !orgId) redirect('/sign-in')

  const userId = await resolveUserIdFromClerk(clerkUserId)
  const role   = await resolveEffectiveRole(orgId, userId)
  const steps  = stepsForRole(role)

  return (
    <OnboardingShell
      steps={steps}
      currentSlug="done"
      title="All set"
      description="Welcome to RecruiterStack."
    >
      <DoneStep />
    </OnboardingShell>
  )
}
