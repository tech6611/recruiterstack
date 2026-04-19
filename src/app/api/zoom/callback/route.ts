import { NextRequest, NextResponse } from 'next/server'
import { verifyOAuthState } from '@/lib/api/oauth-state'
import { saveTokens } from '@/lib/integrations/store'
import { postOAuthRedirectBase } from '@/lib/onboarding/redirect-target'
import { logger } from '@/lib/logger'

// GET /api/zoom/callback — per-user integration. Writes tokens to user_integrations.
export async function GET(request: NextRequest) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL!
  const { searchParams } = new URL(request.url)
  const code  = searchParams.get('code')
  const error = searchParams.get('error')
  const state = searchParams.get('state')

  if (error || !code) {
    logger.error('[zoom-oauth] error or no code', undefined, { error })
    return NextResponse.redirect(
      `${appUrl}/settings?zoom=error&reason=${error ?? 'no_code'}`
    )
  }

  if (!state) {
    logger.error('[zoom-oauth] missing state parameter')
    return NextResponse.redirect(`${appUrl}/settings?zoom=error&reason=missing_state`)
  }

  const verified = verifyOAuthState(state)
  if (!verified || !verified.userId) {
    logger.error('[zoom-oauth] invalid/expired state or missing userId')
    return NextResponse.redirect(`${appUrl}/settings?zoom=error&reason=invalid_state`)
  }

  const { orgId, userId } = verified as { orgId: string; userId: string }

  const clientId     = process.env.ZOOM_CLIENT_ID
  const clientSecret = process.env.ZOOM_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    logger.error('[zoom-oauth] ZOOM_CLIENT_ID or ZOOM_CLIENT_SECRET not set')
    return NextResponse.redirect(`${appUrl}/settings?zoom=error&reason=missing_env`)
  }

  const redirectUri = `${appUrl}/api/zoom/callback`

  // Zoom uses Basic auth for the token exchange
  const tokenRes = await fetch('https://zoom.us/oauth/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
    },
    body: new URLSearchParams({
      code,
      grant_type:   'authorization_code',
      redirect_uri: redirectUri,
    }),
  })

  const tokenData = await tokenRes.json()

  if (tokenData.error) {
    logger.error('[zoom-oauth] token exchange failed', undefined, { error: tokenData.error })
    return NextResponse.redirect(
      `${appUrl}/settings?zoom=error&reason=token_${tokenData.error ?? 'unknown'}`
    )
  }

  const access_token  = tokenData.access_token as string
  const refresh_token = (tokenData.refresh_token as string | undefined) ?? null
  const expires_in    = (tokenData.expires_in as number) ?? 3600
  const scope_str     = (tokenData.scope as string | undefined) ?? ''
  const token_expiry  = new Date(Date.now() + expires_in * 1000).toISOString()

  // Fetch connected Zoom user info
  const userRes = await fetch('https://api.zoom.us/v2/users/me', {
    headers: { Authorization: `Bearer ${access_token}` },
  })
  const userInfo = await userRes.json()
  const connected_email = (userInfo.email as string) ?? null
  const account_id      = (userInfo.account_id as string) ?? null

  try {
    await saveTokens({
      user_id: userId,
      org_id: orgId,
      provider: 'zoom',
      access_token,
      refresh_token,
      token_expiry,
      connected_email,
      scopes: scope_str ? scope_str.split(' ').filter(Boolean) : [],
      account_id,
    })
  } catch (err) {
    logger.error('[zoom-oauth] saveTokens failed', err, { userId })
    return NextResponse.redirect(`${appUrl}/settings?zoom=error&reason=db_save`)
  }

  const base = await postOAuthRedirectBase(orgId, userId)
  return NextResponse.redirect(`${appUrl}${base}?zoom=connected`)
}
