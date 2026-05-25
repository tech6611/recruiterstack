import type { NextRequest } from 'next/server'
import type { OAuthOrigin } from '@/lib/api/oauth-state'

/**
 * Read the optional `?origin=` query param on an OAuth connect/install route.
 * Connect buttons rendered inside the onboarding integrations step pass
 * `origin=onboarding` so the callback can return the user to that step instead
 * of /settings. Anything unrecognized is treated as absent.
 */
export function readOAuthOrigin(req: NextRequest): OAuthOrigin | undefined {
  const value = req.nextUrl.searchParams.get('origin')
  return value === 'onboarding' || value === 'settings' ? value : undefined
}
