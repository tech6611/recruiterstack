import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { createAdminClient } from '@/lib/supabase/server'
import { verifyOAuthState } from '@/lib/api/oauth-state'
import { encrypt } from '@/lib/crypto'
import { resolveUserIdFromClerk } from '@/lib/auth'
import { postOAuthRedirectBase } from '@/lib/onboarding/redirect-target'
import { logger } from '@/lib/logger'

// GET /api/slack/callback — Slack sends the user here after OAuth
export async function GET(request: NextRequest) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL!
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const error = searchParams.get('error')
  const state = searchParams.get('state')

  if (error || !code) {
    logger.error('[slack-oauth] slack returned error or no code', undefined, { error })
    return NextResponse.redirect(`${appUrl}/settings?slack=error&reason=${error ?? 'no_code'}`)
  }

  // Verify CSRF state
  if (!state) {
    logger.error('[slack-oauth] missing state parameter')
    return NextResponse.redirect(`${appUrl}/settings?slack=error&reason=missing_state`)
  }

  const verified = verifyOAuthState(state)
  if (!verified) {
    logger.error('[slack-oauth] invalid or expired state parameter')
    return NextResponse.redirect(`${appUrl}/settings?slack=error&reason=invalid_state`)
  }

  const orgId = verified.orgId

  // Verify env vars are present
  const clientId = process.env.SLACK_CLIENT_ID
  const clientSecret = process.env.SLACK_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    logger.error('[slack-oauth] SLACK_CLIENT_ID or SLACK_CLIENT_SECRET not set')
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
    logger.error('[slack-oauth] token exchange failed', undefined, { error: tokenData.error })
    return NextResponse.redirect(`${appUrl}/settings?slack=error&reason=token_${tokenData.error ?? 'unknown'}`)
  }

  const botToken = tokenData.access_token as string
  const teamId = tokenData.team?.id as string
  const teamName = tokenData.team?.name as string

  // Encrypt token before storing
  const encryptedBotToken = process.env.TOKEN_ENCRYPTION_KEY ? encrypt(botToken) : botToken

  // Store in org_settings
  const supabase = createAdminClient()
  const { error: upsertError } = await supabase
    .from('org_settings')
    .upsert(
      {
        org_id: orgId,
        slack_bot_token: encryptedBotToken,
        slack_team_id: teamId,
        slack_team_name: teamName,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'org_id' }
    )

  if (upsertError) {
    logger.error('[slack-oauth] upsert failed', upsertError)
    return NextResponse.redirect(
      `${appUrl}/settings?slack=error&reason=db_${encodeURIComponent(upsertError.code ?? 'unknown')}`
    )
  }

  // Slack state only carries orgId; look up the current Clerk user to
  // decide whether to land on settings or resume onboarding.
  const { userId: clerkUserId } = auth()
  const userId = clerkUserId ? await resolveUserIdFromClerk(clerkUserId).catch(() => null) : null
  const base = await postOAuthRedirectBase(orgId, userId)
  return NextResponse.redirect(`${appUrl}${base}?slack=connected`)
}
