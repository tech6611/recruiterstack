import { createAdminClient } from '@/lib/supabase/server'

// ── Webhook: sends to a Slack channel via incoming webhook URL ────────────────
export async function notifySlack(orgId: string, text: string): Promise<void> {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('org_settings')
    .select('slack_webhook_url')
    .eq('org_id', orgId)
    .single()

  const url = data?.slack_webhook_url
  if (!url) return

  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    })
  } catch (e) {
    console.error('[slack] notification failed:', e)
  }
}

// ── OAuth bot: DMs a specific person by their email address ──────────────────
export async function notifySlackDM(
  orgId: string,
  email: string,
  text: string
): Promise<void> {
  if (!email) return

  const supabase = createAdminClient()
  const { data } = await supabase
    .from('org_settings')
    .select('slack_bot_token')
    .eq('org_id', orgId)
    .single()

  const token = data?.slack_bot_token
  if (!token) return

  try {
    // Look up the Slack user by their email address
    const userRes = await fetch(
      `https://slack.com/api/users.lookupByEmail?email=${encodeURIComponent(email)}`,
      { headers: { Authorization: `Bearer ${token}` } }
    )
    const userData = await userRes.json()
    if (!userData.ok || !userData.user?.id) return

    // Send DM (Slack accepts a user ID as the channel for direct messages)
    await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ channel: userData.user.id, text }),
    })
  } catch (e) {
    console.error('[slack-dm] failed:', e)
  }
}
