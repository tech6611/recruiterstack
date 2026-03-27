import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { verifyOAuthState } from '@/lib/api/oauth-state'
import { encrypt } from '@/lib/crypto'
import { logger } from '@/lib/logger'

// GET /api/microsoft/callback — Microsoft sends user here after OAuth consent
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
    return NextResponse.redirect(
      `${appUrl}/settings?microsoft=error&reason=missing_state`
    )
  }

  const verified = verifyOAuthState(state)
  if (!verified) {
    logger.error('[ms-oauth] invalid or expired state parameter')
    return NextResponse.redirect(
      `${appUrl}/settings?microsoft=error&reason=invalid_state`
    )
  }

  const orgId = verified.orgId

  const clientId     = process.env.MS_CLIENT_ID
  const clientSecret = process.env.MS_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    logger.error('[ms-oauth] MS_CLIENT_ID or MS_CLIENT_SECRET not set')
    return NextResponse.redirect(
      `${appUrl}/settings?microsoft=error&reason=missing_env`
    )
  }

  const redirectUri = `${appUrl}/api/microsoft/callback`

  // Exchange authorization code for tokens
  const tokenRes = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id:     clientId,
      client_secret: clientSecret,
      code,
      redirect_uri:  redirectUri,
      grant_type:    'authorization_code',
      scope:         'Calendars.ReadWrite OnlineMeetings.ReadWrite User.Read offline_access',
    }),
  })

  const tokenData = await tokenRes.json()

  if (tokenData.error) {
    logger.error('[ms-oauth] token exchange failed', undefined, { error: tokenData.error })
    return NextResponse.redirect(
      `${appUrl}/settings?microsoft=error&reason=token_${tokenData.error ?? 'unknown'}`
    )
  }

  const access_token  = tokenData.access_token  as string
  const refresh_token = tokenData.refresh_token as string
  const expires_in    = (tokenData.expires_in   as number) ?? 3600
  const token_expiry  = new Date(Date.now() + expires_in * 1000).toISOString()

  // Fetch user profile for connected email display
  const profileRes = await fetch('https://graph.microsoft.com/v1.0/me', {
    headers: { Authorization: `Bearer ${access_token}` },
  })
  const profile = await profileRes.json()
  const connected_email = (profile.mail as string) ?? (profile.userPrincipalName as string) ?? null
  const tenant_id       = (profile.id as string) ?? null

  // Encrypt tokens before storing
  const encryptedAccess  = process.env.TOKEN_ENCRYPTION_KEY ? encrypt(access_token) : access_token
  const encryptedRefresh = process.env.TOKEN_ENCRYPTION_KEY && refresh_token ? encrypt(refresh_token) : refresh_token

  // Persist tokens in org_settings
  const supabase = createAdminClient()
  const { error: upsertError } = await supabase
    .from('org_settings')
    .upsert(
      {
        org_id:             orgId,
        ms_access_token:    encryptedAccess,
        ms_refresh_token:   encryptedRefresh,
        ms_token_expiry:    token_expiry,
        ms_tenant_id:       tenant_id,
        ms_connected_email: connected_email,
        updated_at:         new Date().toISOString(),
      },
      { onConflict: 'org_id' }
    )

  if (upsertError) {
    logger.error('[ms-oauth] upsert failed', upsertError)
    return NextResponse.redirect(
      `${appUrl}/settings?microsoft=error&reason=db_${encodeURIComponent(upsertError.code ?? 'unknown')}`
    )
  }

  return NextResponse.redirect(`${appUrl}/settings?microsoft=connected`)
}
