import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getOrgId } from '@/lib/auth'

// GET /api/slack/callback — Slack sends the user here after OAuth
export async function GET(request: NextRequest) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL!
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const error = searchParams.get('error')

  if (error || !code) {
    console.error('[slack-oauth] slack returned error or no code:', error)
    return NextResponse.redirect(`${appUrl}/settings?slack=error&reason=${error ?? 'no_code'}`)
  }

  // Get the org for the currently logged-in user (Clerk session cookie persists)
  const orgId = await getOrgId()
  if (!orgId) {
    console.error('[slack-oauth] getOrgId() returned null — Clerk session may not persist through OAuth redirect')
    return NextResponse.redirect(`${appUrl}/settings?slack=error&reason=no_orgid`)
  }

  // Verify env vars are present
  const clientId = process.env.SLACK_CLIENT_ID
  const clientSecret = process.env.SLACK_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    console.error('[slack-oauth] SLACK_CLIENT_ID or SLACK_CLIENT_SECRET not set')
    return NextResponse.redirect(`${appUrl}/settings?slack=error&reason=missing_env`)
  }

  const redirectUri = `${appUrl}/api/slack/callback`

  const params = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
  })

  const tokenRes = await fetch('https://slack.com/api/oauth.v2.access', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  })

  const tokenData = await tokenRes.json()

  if (!tokenData.ok) {
    console.error('[slack-oauth] token exchange failed:', tokenData.error)
    return NextResponse.redirect(`${appUrl}/settings?slack=error&reason=token_${tokenData.error ?? 'unknown'}`)
  }

  const botToken = tokenData.access_token as string
  const teamId = tokenData.team?.id as string
  const teamName = tokenData.team?.name as string

  // Store in org_settings
  const supabase = createAdminClient()
  const { error: upsertError } = await supabase
    .from('org_settings')
    .upsert(
      {
        org_id: orgId,
        slack_bot_token: botToken,
        slack_team_id: teamId,
        slack_team_name: teamName,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'org_id' }
    )

  if (upsertError) {
    console.error('[slack-oauth] upsert failed:', upsertError)
    return NextResponse.redirect(
      `${appUrl}/settings?slack=error&reason=db_${encodeURIComponent(upsertError.code ?? 'unknown')}`
    )
  }

  return NextResponse.redirect(`${appUrl}/settings?slack=connected`)
}
