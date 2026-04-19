import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/server'
import { resolveUserIdFromClerk } from '@/lib/auth'
import { resolveEffectiveRole, stepsForRole } from '@/lib/onboarding/steps'
import { OnboardingShell } from '@/components/onboarding/OnboardingShell'
import { ProfileForm } from '@/components/onboarding/forms/ProfileForm'
import type { User } from '@/lib/types/requisitions'

export default async function ProfileStepPage() {
  const { userId: clerkUserId, orgId } = auth()
  if (!clerkUserId || !orgId) redirect('/sign-in')

  const userId = await resolveUserIdFromClerk(clerkUserId)
  const role   = await resolveEffectiveRole(orgId, userId)
  const steps  = stepsForRole(role)

  const supabase = createAdminClient()
  const { data: me } = await supabase
    .from('users')
    .select('first_name, last_name')
    .eq('id', userId)
    .single()

  const defaults = me as Pick<User, 'first_name' | 'last_name'> | null

  return (
    <OnboardingShell
      steps={steps}
      currentSlug="profile"
      title="Your profile"
      description="Quickly confirm the basics we pulled from your account."
    >
      <ProfileForm defaults={{ first_name: defaults?.first_name ?? '', last_name: defaults?.last_name ?? '' }} />
    </OnboardingShell>
  )
}
