import { redirect } from 'next/navigation'

// Entry point — always start at "profile". Layout handles auth + "already onboarded" redirect.
export default function OnboardingIndex() {
  redirect('/onboarding/profile')
}
