import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireOrg } from '@/lib/auth'

// POST /api/slack/disconnect — clears the bot token for this org
export async function POST() {
  const authResult = await requireOrg()
  if (authResult instanceof NextResponse) return authResult
  const { orgId } = authResult

  const supabase = createAdminClient()
  await supabase
    .from('org_settings')
    .upsert(
      {
        org_id: orgId,
        slack_bot_token: null,
        slack_team_id: null,
        slack_team_name: null,
        // Channel posting depends on the bot token, so clear the chosen channel
        // too — dispatch falls back to the webhook until Slack is reconnected.
        slack_channel_id: null,
        slack_channel_name: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'org_id' }
    )

  return NextResponse.json({ ok: true })
}
