import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { getOrgId, resolveUserIdFromClerk } from '@/lib/auth'
import { resolveEffectiveRole, stepsForRole } from '@/lib/onboarding/steps'
import { markOnboarded } from '@/lib/onboarding/server'
import { OnboardingShell } from '@/components/onboarding/OnboardingShell'
import { DoneStep } from '@/components/onboarding/forms/DoneStep'

export default async function DonePage() {
  const { userId: clerkUserId } = auth()
  const orgId = await getOrgId()
  if (!clerkUserId || !orgId) redirect('/sign-in')

  const userId = await resolveUserIdFromClerk(clerkUserId)
  const role   = await resolveEffectiveRole(orgId, userId)
  const steps  = stepsForRole(role)

  // Backstop: reaching the done screen unambiguously means complete. Stamp
  // server-side (idempotent) so completion never depends on the client-side
  // POST in DoneStep succeeding.
  await markOnboarded(orgId, userId)

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
