/**
 * Decide whether an OAuth callback should redirect to /settings (normal) or
 * /onboarding/integrations (mid-onboarding). Keeps callbacks uncluttered.
 */

import { createAdminClient } from '@/lib/supabase/server'

export async function postOAuthRedirectBase(orgId: string, userId: string | null): Promise<string> {
  if (!userId) return '/settings'
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('org_members')
    .select('onboarded_at')
    .eq('org_id', orgId)
    .eq('user_id', userId)
    .maybeSingle()

  const onboarded = (data as { onboarded_at: string | null } | null)?.onboarded_at
  return onboarded ? '/settings' : '/onboarding/integrations'
}
