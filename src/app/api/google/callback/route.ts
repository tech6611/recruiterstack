import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getOrgId } from '@/lib/auth'

// GET /api/google/callback — Google sends user here after OAuth consent
export async function GET(request: NextRequest) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL!
  const { searchParams } = new URL(request.url)
  const code  = searchParams.get('code')
  const error = searchParams.get('error')

  if (error || !code) {
    console.error('[google-oauth] error or no code:', error)
    return NextResponse.redirect(
      `${appUrl}/settings?google=error&reason=${error ?? 'no_code'}`
    )
  }

  const orgId = await getOrgId()
  if (!orgId) {
    console.error('[google-oauth] getOrgId() returned null')
    return NextResponse.redirect(
      `${appUrl}/settings?google=error&reason=no_orgid`
    )
  }

  const clientId     = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    console.error('[google-oauth] GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET not set')
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
    console.error('[google-oauth] token exchange failed:', tokenData.error)
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

  // Persist tokens in org_settings
  const supabase = createAdminClient()
  await supabase
    .from('org_settings')
    .upsert(
      {
        org_id:                      orgId,
        google_oauth_access_token:   access_token,
        google_oauth_refresh_token:  refresh_token,
        google_oauth_token_expiry:   token_expiry,
        google_connected_email:      connected_email,
        updated_at:                  new Date().toISOString(),
      },
      { onConflict: 'org_id' }
    )

  return NextResponse.redirect(`${appUrl}/settings?google=connected`)
}
