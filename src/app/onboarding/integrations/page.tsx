import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/server'
import { resolveUserIdFromClerk } from '@/lib/auth'
import { resolveEffectiveRole, stepsForRole, nextStep } from '@/lib/onboarding/steps'
import { OnboardingShell } from '@/components/onboarding/OnboardingShell'
import { IntegrationsStep } from '@/components/onboarding/forms/IntegrationsStep'

export default async function IntegrationsStepPage() {
  const { userId: clerkUserId, orgId } = auth()
  if (!clerkUserId || !orgId) redirect('/sign-in')

  const userId = await resolveUserIdFromClerk(clerkUserId)
  const role   = await resolveEffectiveRole(orgId, userId)
  const steps  = stepsForRole(role)
  const isAdmin = role === 'admin' || role === 'pending-admin'

  const supabase = createAdminClient()
  const [{ data: integrations }, { data: org }] = await Promise.all([
    supabase.from('user_integrations').select('provider, connected_email').eq('user_id', userId),
    supabase.from('org_settings').select('slack_bot_token, slack_team_name').eq('org_id', orgId).maybeSingle(),
  ])

  const byProvider = new Map<string, string | null>()
  for (const row of (integrations ?? []) as Array<{ provider: string; connected_email: string | null }>) {
    byProvider.set(row.provider, row.connected_email)
  }

  const next = nextStep('integrations', role)
  return (
    <OnboardingShell
      steps={steps}
      currentSlug="integrations"
      title="Integrations"
      description="Connect your calendar and meeting tools so we can schedule interviews for you."
    >
      <IntegrationsStep
        isAdmin={isAdmin}
        google={{    connected: byProvider.has('google'),    email: byProvider.get('google')    ?? null }}
        microsoft={{ connected: byProvider.has('microsoft'), email: byProvider.get('microsoft') ?? null }}
        zoom={{      connected: byProvider.has('zoom'),      email: byProvider.get('zoom')      ?? null }}
        slack={{
          connected: !!(org as { slack_bot_token: string | null } | null)?.slack_bot_token,
          teamName:  (org as { slack_team_name: string | null } | null)?.slack_team_name ?? null,
        }}
        nextHref={next ? `/onboarding/${next}` : '/dashboard'}
      />
    </OnboardingShell>
  )
}
