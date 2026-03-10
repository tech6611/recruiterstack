import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireOrg } from '@/lib/auth'

// GET /api/org-settings — returns current settings for the org
export async function GET() {
  const authResult = await requireOrg()
  if (authResult instanceof NextResponse) return authResult
  const { orgId } = authResult

  const supabase = createAdminClient()
  const { data } = await supabase
    .from('org_settings')
    .select('slack_webhook_url, slack_bot_token, slack_team_name')
    .eq('org_id', orgId)
    .single()

  // Never expose the bot token to the client
  return NextResponse.json({
    data: {
      slack_webhook_url: data?.slack_webhook_url ?? null,
      slack_connected: !!data?.slack_bot_token,
      slack_team_name: data?.slack_team_name ?? null,
    },
  })
}

// PATCH /api/org-settings — upsert { slack_webhook_url }
export async function PATCH(request: NextRequest) {
  const authResult = await requireOrg()
  if (authResult instanceof NextResponse) return authResult
  const { orgId } = authResult

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('org_settings')
    .upsert(
      { org_id: orgId, slack_webhook_url: body.slack_webhook_url ?? null, updated_at: new Date().toISOString() },
      { onConflict: 'org_id' }
    )
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}
