import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { verifyOAuthState } from '@/lib/api/oauth-state'
import { encrypt } from '@/lib/crypto'
import { logger } from '@/lib/logger'

// GET /api/google/callback — Google sends user here after OAuth consent
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

  // Verify CSRF state
  if (!state) {
    logger.error('[google-oauth] missing state parameter')
    return NextResponse.redirect(
      `${appUrl}/settings?google=error&reason=missing_state`
    )
  }

  const verified = verifyOAuthState(state)
  if (!verified) {
    logger.error('[google-oauth] invalid or expired state parameter')
    return NextResponse.redirect(
      `${appUrl}/settings?google=error&reason=invalid_state`
    )
  }

  const orgId = verified.orgId

  const clientId     = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    logger.error('[google-oauth] GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET not set')
    return NextResponse.redirect(
      `${appUrl}/settings?google=error&reason=missing_env`
    )
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
  const refresh_token = tokenData.refresh_token as string
  const expires_in    = (tokenData.expires_in   as number) ?? 3600
  const token_expiry  = new Date(Date.now() + expires_in * 1000).toISOString()

  // Fetch the connected Google email for display in settings
  const userInfoRes  = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${access_token}` },
  })
  const userInfo = await userInfoRes.json()
  const connected_email = (userInfo.email as string) ?? null

  // Encrypt tokens before storing
  const encryptedAccess  = process.env.TOKEN_ENCRYPTION_KEY ? encrypt(access_token) : access_token
  const encryptedRefresh = process.env.TOKEN_ENCRYPTION_KEY && refresh_token ? encrypt(refresh_token) : refresh_token

  // Persist tokens in org_settings
  const supabase = createAdminClient()
  const { error: upsertError } = await supabase
    .from('org_settings')
    .upsert(
      {
        org_id:                      orgId,
        google_oauth_access_token:   encryptedAccess,
        google_oauth_refresh_token:  encryptedRefresh,
        google_oauth_token_expiry:   token_expiry,
        google_connected_email:      connected_email,
        updated_at:                  new Date().toISOString(),
      },
      { onConflict: 'org_id' }
    )

  if (upsertError) {
    logger.error('[google-oauth] upsert failed', upsertError)
    return NextResponse.redirect(
      `${appUrl}/settings?google=error&reason=db_${encodeURIComponent(upsertError.code ?? 'unknown')}`
    )
  }

  return NextResponse.redirect(`${appUrl}/settings?google=connected`)
}
