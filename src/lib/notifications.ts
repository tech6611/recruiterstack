import { createAdminClient } from '@/lib/supabase/server'
import { logger } from '@/lib/logger'
import { createNotification, type NotificationType } from '@/lib/api/notify'
import { dispatchSlackEvent } from '@/lib/slack/dispatch'
import { chatPostMessage } from '@/lib/slack/client'
import { resolveSlackUserIdByEmail } from '@/lib/slack/identity'
import type { SlackEventKey } from '@/lib/types/database'

interface NotifyParams {
  orgId: string
  type: NotificationType
  title: string
  body?: string
  slackText: string
  resourceType?: string
  resourceId?: string
  // When set, the Slack side is routed through the per-event Slack hub gate
  // (channel + role DMs per the org's config) instead of always posting to the
  // channel. `applicationId` lets the gate resolve DM recipients. Callers that
  // omit these keep the original channel-only behaviour.
  slackEvent?: SlackEventKey
  applicationId?: string
}

/**
 * Combined notification: creates an in-app notification AND sends a Slack message in parallel.
 * Non-throwing — both channels are fire-and-forget.
 */
export async function notify(params: NotifyParams): Promise<void> {
  await Promise.all([
    createNotification({
      orgId: params.orgId,
      type: params.type,
      title: params.title,
      body: params.body,
      resourceType: params.resourceType,
      resourceId: params.resourceId,
    }),
    params.slackEvent
      ? dispatchSlackEvent({
          orgId: params.orgId,
          event: params.slackEvent,
          text: params.slackText,
          applicationId: params.applicationId,
        })
      : notifySlack(params.orgId, params.slackText),
  ])
}

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
    logger.error('[slack] notification failed', e)
  }
}

// ── OAuth bot: DMs a specific person by their email address ──────────────────
// Resolves the email → Slack user id via the cached identity resolver, then
// sends via the shared client. `blocks` is optional — pass Block Kit for rich,
// interactive DMs (buttons handled by /api/slack/interactions); `text` is always
// used as the notification/fallback string. No-ops (with a logged warning) when
// the email isn't a workspace member — email/in-app still reach them.
export async function notifySlackDM(
  orgId: string,
  email: string,
  text: string,
  blocks?: unknown[],
): Promise<void> {
  if (!email) return
  const slackUserId = await resolveSlackUserIdByEmail(orgId, email)
  if (!slackUserId) return
  // Slack accepts a user id as the channel for a direct message.
  await chatPostMessage(orgId, { channel: slackUserId, text, blocks })
}
