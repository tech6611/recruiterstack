import { NextRequest, NextResponse } from 'next/server'
import { verifyOAuthState } from '@/lib/api/oauth-state'
import { saveTokens } from '@/lib/integrations/store'
import { postOAuthRedirectBase } from '@/lib/onboarding/redirect-target'
import { logger } from '@/lib/logger'

// GET /api/microsoft/callback — Microsoft redirects here after OAuth consent.
// State carries orgId + userId (set by /api/microsoft/connect).
// Tokens go to user_integrations, not org_settings.
export async function GET(request: NextRequest) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL!
  const { searchParams } = new URL(request.url)
  const code  = searchParams.get('code')
  const error = searchParams.get('error')
  const state = searchParams.get('state')

  if (error || !code) {
    logger.error('[ms-oauth] error or no code', undefined, { error })
    return NextResponse.redirect(
      `${appUrl}/settings?microsoft=error&reason=${error ?? 'no_code'}`
    )
  }

  if (!state) {
    logger.error('[ms-oauth] missing state parameter')
    return NextResponse.redirect(`${appUrl}/settings?microsoft=error&reason=missing_state`)
  }

  const verified = verifyOAuthState(state)
  if (!verified || !verified.userId) {
    logger.error('[ms-oauth] invalid/expired state or missing userId')
    return NextResponse.redirect(`${appUrl}/settings?microsoft=error&reason=invalid_state`)
  }

  const { orgId, userId } = verified as { orgId: string; userId: string }

  const clientId     = process.env.MS_CLIENT_ID
  const clientSecret = process.env.MS_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    logger.error('[ms-oauth] MS_CLIENT_ID or MS_CLIENT_SECRET not set')
    return NextResponse.redirect(`${appUrl}/settings?microsoft=error&reason=missing_env`)
  }

  const redirectUri = `${appUrl}/api/microsoft/callback`

  const tokenRes = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id:     clientId,
      client_secret: clientSecret,
      code,
      redirect_uri:  redirectUri,
      grant_type:    'authorization_code',
      scope:         'Calendars.ReadWrite User.Read offline_access',
    }),
  })

  const tokenData = await tokenRes.json()

  if (tokenData.error) {
    logger.error('[ms-oauth] token exchange failed', undefined, { error: tokenData.error })
    return NextResponse.redirect(
      `${appUrl}/settings?microsoft=error&reason=token_${tokenData.error ?? 'unknown'}`
    )
  }

  const access_token  = tokenData.access_token as string
  const refresh_token = (tokenData.refresh_token as string | undefined) ?? null
  const expires_in    = (tokenData.expires_in as number) ?? 3600
  const scope_str     = (tokenData.scope as string | undefined) ?? ''
  const token_expiry  = new Date(Date.now() + expires_in * 1000).toISOString()

  // Fetch user profile for connected email display
  const profileRes = await fetch('https://graph.microsoft.com/v1.0/me', {
    headers: { Authorization: `Bearer ${access_token}` },
  })
  const profile = await profileRes.json()
  const connected_email = (profile.mail as string) ?? (profile.userPrincipalName as string) ?? null
  const tenant_id       = (profile.id as string) ?? null

  try {
    await saveTokens({
      user_id: userId,
      org_id: orgId,
      provider: 'microsoft',
      access_token,
      refresh_token,
      token_expiry,
      connected_email,
      scopes: scope_str ? scope_str.split(' ').filter(Boolean) : [],
      tenant_id,
    })
  } catch (err) {
    logger.error('[ms-oauth] saveTokens failed', err, { userId })
    return NextResponse.redirect(`${appUrl}/settings?microsoft=error&reason=db_save`)
  }

  const base = await postOAuthRedirectBase(orgId, userId)
  return NextResponse.redirect(`${appUrl}${base}?microsoft=connected`)
}
