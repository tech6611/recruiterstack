import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/server'
import { resolveUserIdFromClerk } from '@/lib/auth'
import { resolveEffectiveRole, stepsForRole, nextStep } from '@/lib/onboarding/steps'
import { OnboardingShell } from '@/components/onboarding/OnboardingShell'
import { ModulesForm } from '@/components/onboarding/forms/ModulesForm'
import type { AgentKey } from '@/lib/types/database'

export default async function ModulesStepPage() {
  const { userId: clerkUserId, orgId } = auth()
  if (!clerkUserId || !orgId) redirect('/sign-in')

  const userId = await resolveUserIdFromClerk(clerkUserId)
  const role   = await resolveEffectiveRole(orgId, userId)
  if (role === 'member') {
    const next = nextStep('role', role)
    redirect(next ? `/onboarding/${next}` : '/dashboard')
  }

  const steps = stepsForRole(role)
  const supabase = createAdminClient()
  const { data: settings } = await supabase
    .from('org_settings')
    .select('enabled_agents')
    .eq('org_id', orgId)
    .maybeSingle()

  const defaults = ((settings as { enabled_agents: AgentKey[] } | null)?.enabled_agents)
    ?? (['drafter', 'scout', 'sifter', 'scheduler', 'closer'] as AgentKey[])

  return (
    <OnboardingShell
      steps={steps}
      currentSlug="modules"
      title="AI agents"
      description="Enable the agents your team will use. You can change this later in Settings."
    >
      <ModulesForm defaults={defaults} />
    </OnboardingShell>
  )
}
