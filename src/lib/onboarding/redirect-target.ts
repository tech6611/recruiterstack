/**
 * Decide whether an OAuth callback should redirect to /settings (normal) or
 * /onboarding/integrations (mid-onboarding). Keeps callbacks uncluttered.
 *
 * Origin is authoritative when present: the connect button on the onboarding
 * integrations step signs `origin: 'onboarding'` into the OAuth state, so we
 * return the user to that step even though `onboarded_at` may already be
 * stamped (we now stamp it on *reaching* integrations, not on finishing it —
 * see lib/onboarding/server.ts). Without an explicit origin we fall back to the
 * legacy `onboarded_at` heuristic so older/in-flight states still behave.
 */

import { createAdminClient } from '@/lib/supabase/server'
import type { OAuthOrigin } from '@/lib/api/oauth-state'

export async function postOAuthRedirectBase(
  orgId: string,
  userId: string | null,
  origin?: OAuthOrigin,
): Promise<string> {
  if (origin === 'onboarding') return '/onboarding/integrations'
  if (origin === 'settings') return '/settings'

  // No explicit origin (legacy state): infer from onboarding completion.
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
