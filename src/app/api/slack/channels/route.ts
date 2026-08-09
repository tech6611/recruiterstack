import { NextResponse } from 'next/server'
import { withCapability } from '@/lib/api/helpers'
import { conversationsList } from '@/lib/slack/client'

// GET /api/slack/channels
// Public channels in the org's connected Slack workspace, for the Settings
// channel picker. Admin-only (same gate as other Slack settings). Returns []
// when Slack isn't connected.
export const GET = withCapability('settings:edit', async (_request, orgId) => {
  const channels = await conversationsList(orgId)
  return NextResponse.json({ data: channels })
})
