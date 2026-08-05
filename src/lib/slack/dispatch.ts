import { createAdminClient } from '@/lib/supabase/server'
import { notifySlack, notifySlackDM } from '@/lib/notifications'
import { resolveEventRouting } from '@/lib/slack/routing'
import { buildLifecycleBlocks } from '@/lib/slack/blocks'
import { chatPostMessage } from '@/lib/slack/client'
import { logger } from '@/lib/logger'
import {
  resolveApplicationHiringManager,
  resolveApplicationRecruiterEmail,
} from '@/modules/ats/domain/job-pipelines'
import { getApplicationCandidateIdAndJob } from '@/modules/ats/domain/applications'
import type { SlackEventKey, SlackDmRole, SlackRouting } from '@/lib/types/database'

export { DEFAULT_SLACK_ROUTING, resolveEventRouting } from '@/lib/slack/routing'

interface DispatchParams {
  orgId: string
  event: SlackEventKey
  text: string
  // Needed to resolve dm_roles to real people. Optional so an event without an
  // application (should not happen for the Phase-1 events) simply skips DMs.
  applicationId?: string
}

// Resolve a role to the email we DM. Hiring-manager and recruiter both derive
// from the application's canonical job. Returns null when unattached → DM skipped.
async function resolveRoleEmail(
  supabase: ReturnType<typeof createAdminClient>,
  orgId: string,
  applicationId: string,
  role: SlackDmRole,
): Promise<string | null> {
  if (role === 'hiring_manager') {
    const hm = await resolveApplicationHiringManager(supabase, orgId, applicationId)
    return hm?.email ?? null
  }
  return resolveApplicationRecruiterEmail(supabase, orgId, applicationId)
}

// Post a lifecycle event to the org's chosen channel via the bot token, threading
// follow-up events under the first message for that candidate. Best-effort: on the
// first post for an application we record its ts in slack_channel_messages; later
// events for the same application reply in-thread. Non-throwing.
async function postToChannel(
  supabase: ReturnType<typeof createAdminClient>,
  orgId: string,
  channelId: string,
  text: string,
  blocks: unknown[] | undefined,
  applicationId: string | undefined,
): Promise<void> {
  // Look up an existing thread anchor for this candidate.
  let threadTs: string | undefined
  if (applicationId) {
    const { data } = await supabase
      .from('slack_channel_messages')
      .select('ts')
      .eq('org_id', orgId)
      .eq('application_id', applicationId)
      .maybeSingle()
    threadTs = (data as { ts: string } | null)?.ts ?? undefined
  }

  const res = await chatPostMessage(orgId, {
    channel: channelId,
    text,
    blocks,
    ...(threadTs ? { thread_ts: threadTs } : {}),
  })

  // First post for this application → remember its ts so later events thread under it.
  if (applicationId && !threadTs && res?.ok && res.ts) {
    const { error } = await supabase
      .from('slack_channel_messages')
      .upsert(
        { org_id: orgId, application_id: applicationId, channel_id: channelId, ts: res.ts } as never,
        { onConflict: 'org_id,application_id' },
      )
    if (error) logger.warn('[slack] thread-anchor upsert failed', { error: error.message })
  }
}

// The single Slack routing gate. Every routed lifecycle event flows through here:
// it reads the org's per-event config, then fans out to the channel (native
// bot-token post when a channel is chosen, else the legacy webhook) and/or role
// DMs. Non-throwing and fire-and-forget — a Slack failure never blocks the caller.
export async function dispatchSlackEvent(params: DispatchParams): Promise<void> {
  const { orgId, event, text, applicationId } = params
  const supabase = createAdminClient()

  const { data } = await supabase
    .from('org_settings')
    .select('slack_routing, slack_channel_id, slack_bot_token')
    .eq('org_id', orgId)
    .maybeSingle()
  const row = data as {
    slack_routing: SlackRouting | null
    slack_channel_id: string | null
    slack_bot_token: string | null
  } | null

  const routing = resolveEventRouting(row?.slack_routing ?? null, event)
  const channelId = row?.slack_channel_id ?? null
  // Native channel posting needs both a chosen channel and a connected bot.
  const useBotChannel = routing.channel && !!channelId && !!row?.slack_bot_token

  // Build rich, interactive blocks once (shared by the channel post and DMs).
  // Only when we have an application AND something will use them. candidate_id
  // (best-effort) powers the Open link; a miss just drops that one button.
  let blocks: unknown[] | undefined
  if (applicationId && (useBotChannel || routing.dm_roles.length > 0)) {
    const { data: appInfo } = await getApplicationCandidateIdAndJob(supabase, orgId, applicationId)
    blocks = buildLifecycleBlocks({
      event, text, applicationId,
      candidateId: (appInfo as { candidate_id?: string } | null)?.candidate_id ?? null,
    })
  }

  const tasks: Promise<void>[] = []

  if (routing.channel) {
    if (useBotChannel) {
      tasks.push(postToChannel(supabase, orgId, channelId!, text, blocks, applicationId))
    } else {
      // No channel chosen (or Slack not connected) → legacy plain-text webhook.
      tasks.push(notifySlack(orgId, text))
    }
  }

  if (applicationId && routing.dm_roles.length > 0) {
    // Rich, interactive DM: same summary text plus Move-stage / Add-note / Open
    // buttons (handled by /api/slack/interactions).
    // De-dupe emails so a person who is both recruiter and HM isn't DM'd twice.
    const seen = new Set<string>()
    for (const role of routing.dm_roles) {
      const email = await resolveRoleEmail(supabase, orgId, applicationId, role)
      if (email && !seen.has(email.toLowerCase())) {
        seen.add(email.toLowerCase())
        tasks.push(notifySlackDM(orgId, email, text, blocks))
      }
    }
  }

  await Promise.all(tasks)
}
