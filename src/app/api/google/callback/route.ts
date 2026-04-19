import { NextRequest, NextResponse } from 'next/server'
import { verifyOAuthState } from '@/lib/api/oauth-state'
import { saveTokens } from '@/lib/integrations/store'
import { logger } from '@/lib/logger'

// GET /api/google/callback — Google sends user here after OAuth consent.
// State carries orgId + userId (our internal UUID, set by /api/google/connect).
// Tokens are written into user_integrations, not org_settings.
export async function GET(request: NextRequest) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL!
  const { searchParams } = new URL(request.url)
  const code  = searchParams.get('code')
  const error = searchParams.get('error')
  const state = searchParams.get('state')

  if (error || !code) {
    logger.error('[google-oauth] error or no code', undefined, { error })
    return NextResponse.redirect(
      `${appUrl}/settings?google=error&reason=${error ?? 'no_code'}`
    )
  }

  if (!state) {
    logger.error('[google-oauth] missing state parameter')
    return NextResponse.redirect(`${appUrl}/settings?google=error&reason=missing_state`)
  }

  const verified = verifyOAuthState(state)
  if (!verified || !verified.userId) {
    logger.error('[google-oauth] invalid/expired state or missing userId')
    return NextResponse.redirect(`${appUrl}/settings?google=error&reason=invalid_state`)
  }

  const { orgId, userId } = verified as { orgId: string; userId: string }

  const clientId     = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    logger.error('[google-oauth] GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET not set')
    return NextResponse.redirect(`${appUrl}/settings?google=error&reason=missing_env`)
  }

  const redirectUri = `${appUrl}/api/google/callback`

  // Exchange authorization code for tokens
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id:     clientId,
      client_secret: clientSecret,
      redirect_uri:  redirectUri,
      grant_type:    'authorization_code',
    }),
  })

  const tokenData = await tokenRes.json()

  if (tokenData.error) {
    logger.error('[google-oauth] token exchange failed', undefined, { error: tokenData.error })
    return NextResponse.redirect(
      `${appUrl}/settings?google=error&reason=token_${tokenData.error ?? 'unknown'}`
    )
  }

  const access_token  = tokenData.access_token  as string
  const refresh_token = (tokenData.refresh_token as string | undefined) ?? null
  const expires_in    = (tokenData.expires_in   as number) ?? 3600
  const scope_str     = (tokenData.scope as string | undefined) ?? ''
  const token_expiry  = new Date(Date.now() + expires_in * 1000).toISOString()

  // Fetch the connected Google email
  const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${access_token}` },
  })
  const userInfo = await userInfoRes.json()
  const connected_email = (userInfo.email as string) ?? null

  try {
    await saveTokens({
      user_id: userId,
      org_id: orgId,
      provider: 'google',
      access_token,
      refresh_token,
      token_expiry,
      connected_email,
      scopes: scope_str ? scope_str.split(' ').filter(Boolean) : [],
    })
  } catch (err) {
    logger.error('[google-oauth] saveTokens failed', err, { userId })
    return NextResponse.redirect(`${appUrl}/settings?google=error&reason=db_save`)
  }

  return NextResponse.redirect(`${appUrl}/settings?google=connected`)
}
