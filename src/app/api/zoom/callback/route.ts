import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { verifyOAuthState } from '@/lib/api/oauth-state'
import { encrypt } from '@/lib/crypto'
import { logger } from '@/lib/logger'

// GET /api/zoom/callback — Zoom sends user here after OAuth consent
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
    return NextResponse.redirect(
      `${appUrl}/settings?zoom=error&reason=missing_state`
    )
  }

  const verified = verifyOAuthState(state)
  if (!verified) {
    logger.error('[zoom-oauth] invalid or expired state parameter')
    return NextResponse.redirect(
      `${appUrl}/settings?zoom=error&reason=invalid_state`
    )
  }

  const orgId = verified.orgId

  const clientId     = process.env.ZOOM_CLIENT_ID
  const clientSecret = process.env.ZOOM_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    logger.error('[zoom-oauth] ZOOM_CLIENT_ID or ZOOM_CLIENT_SECRET not set')
    return NextResponse.redirect(
      `${appUrl}/settings?zoom=error&reason=missing_env`
    )
  }

  const redirectUri = `${appUrl}/api/zoom/callback`

  // Exchange authorization code for tokens (Zoom uses Basic auth)
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

  const access_token  = tokenData.access_token  as string
  const refresh_token = tokenData.refresh_token as string
  const expires_in    = (tokenData.expires_in   as number) ?? 3600
  const token_expiry  = new Date(Date.now() + expires_in * 1000).toISOString()

  // Fetch connected Zoom user info
  const userRes = await fetch('https://api.zoom.us/v2/users/me', {
    headers: { Authorization: `Bearer ${access_token}` },
  })
  const userInfo = await userRes.json()
  const connected_email = (userInfo.email as string) ?? null
  const account_id      = (userInfo.account_id as string) ?? null

  // Encrypt tokens before storing
  const encryptedAccess  = process.env.TOKEN_ENCRYPTION_KEY ? encrypt(access_token) : access_token
  const encryptedRefresh = process.env.TOKEN_ENCRYPTION_KEY && refresh_token ? encrypt(refresh_token) : refresh_token

  // Persist tokens in org_settings
  const supabase = createAdminClient()
  const { error: upsertError } = await supabase
    .from('org_settings')
    .upsert(
      {
        org_id:               orgId,
        zoom_access_token:    encryptedAccess,
        zoom_refresh_token:   encryptedRefresh,
        zoom_token_expiry:    token_expiry,
        zoom_account_id:      account_id,
        zoom_connected_email: connected_email,
        updated_at:           new Date().toISOString(),
      },
      { onConflict: 'org_id' }
    )

  if (upsertError) {
    logger.error('[zoom-oauth] upsert failed', upsertError)
    return NextResponse.redirect(
      `${appUrl}/settings?zoom=error&reason=db_${encodeURIComponent(upsertError.code ?? 'unknown')}`
    )
  }

  return NextResponse.redirect(`${appUrl}/settings?zoom=connected`)
}
