/**
 * Shared Slack Web API client.
 *
 * Consolidates the get-bot-token → decryptSafe → fetch boilerplate that was
 * previously copy-pasted across notifications.ts, the interactions route, and
 * approvals/notifications.ts. Every send goes through the org's encrypted bot
 * token (OAuth). All helpers are non-throwing: they log and return null/false
 * on failure so a Slack outage never breaks the primary operation.
 *
 * Two flavours of each call:
 *   - `…ByOrg(orgId, …)`   — resolves the org's bot token for you (the common case).
 *   - `…WithToken(token, …)` — you already hold a token (e.g. the interactions
 *      route resolves the org by Slack team id first, then reuses that token).
 */

import { createAdminClient } from '@/lib/supabase/server'
import { decryptSafe } from '@/lib/crypto'
import { logger } from '@/lib/logger'

const SLACK_API = 'https://slack.com/api'

export interface SlackApiResult {
  ok: boolean
  error?: string
  // present on chat.postMessage / chat.update
  ts?: string
  channel?: string
  // present on users.info / users.lookupByEmail
  user?: { id: string; profile?: { email?: string } }
  [key: string]: unknown
}

export interface PostMessageArgs {
  channel: string
  text: string
  blocks?: unknown[]
  /** Set to reply in-thread under an existing message (its ts). */
  thread_ts?: string
}

export interface UpdateMessageArgs {
  channel: string
  ts: string
  text: string
  blocks?: unknown[]
}

// ── Token resolution ─────────────────────────────────────────────────

/** The org's decrypted Slack bot token, or null if Slack isn't connected. */
export async function getBotToken(orgId: string): Promise<string | null> {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('org_settings')
    .select('slack_bot_token')
    .eq('org_id', orgId)
    .maybeSingle()
  return decryptSafe((data as { slack_bot_token: string | null } | null)?.slack_bot_token ?? null)
}

/** True when the org has a usable Slack bot token installed. */
export async function hasSlackInstalled(orgId: string): Promise<boolean> {
  return !!(await getBotToken(orgId))
}

/**
 * Resolve the org that owns a Slack team (workspace) install, returning its id
 * and decrypted bot token. Used by the interactions endpoint, where the inbound
 * payload identifies the workspace by `team.id` rather than our org id.
 */
export async function getOrgBySlackTeam(
  teamId: string,
): Promise<{ orgId: string; token: string } | null> {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('org_settings')
    .select('org_id, slack_bot_token')
    .eq('slack_team_id', teamId)
    .maybeSingle()
  const row = data as { org_id: string; slack_bot_token: string | null } | null
  const token = decryptSafe(row?.slack_bot_token ?? null)
  if (!row || !token) return null
  return { orgId: row.org_id, token }
}

// ── Low-level call ───────────────────────────────────────────────────

/**
 * POST a JSON body to a Slack Web API method with an explicit bot token.
 * Non-throwing: returns a parsed result, or `{ ok: false }` on network error.
 */
export async function callSlack(
  token: string,
  method: string,
  body: Record<string, unknown>,
): Promise<SlackApiResult> {
  try {
    const res = await fetch(`${SLACK_API}/${method}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    return (await res.json()) as SlackApiResult
  } catch (err) {
    logger.error('[slack] api call failed', err, { method })
    return { ok: false, error: 'network_error' }
  }
}

// ── chat.postMessage ─────────────────────────────────────────────────

export async function chatPostMessageWithToken(
  token: string,
  args: PostMessageArgs,
): Promise<SlackApiResult> {
  return callSlack(token, 'chat.postMessage', { ...args })
}

/** Post a message to a channel or DM (channel may be a user id for a DM). */
export async function chatPostMessage(
  orgId: string,
  args: PostMessageArgs,
): Promise<SlackApiResult | null> {
  const token = await getBotToken(orgId)
  if (!token) return null
  return chatPostMessageWithToken(token, args)
}

// ── chat.update ──────────────────────────────────────────────────────

export async function chatUpdateWithToken(
  token: string,
  args: UpdateMessageArgs,
): Promise<SlackApiResult> {
  // blocks defaults to [] so an ack replaces the original interactive blocks.
  return callSlack(token, 'chat.update', { blocks: [], ...args })
}

export async function chatUpdate(
  orgId: string,
  args: UpdateMessageArgs,
): Promise<SlackApiResult | null> {
  const token = await getBotToken(orgId)
  if (!token) return null
  return chatUpdateWithToken(token, args)
}

// ── views.open (modals) ──────────────────────────────────────────────

export async function viewsOpenWithToken(
  token: string,
  triggerId: string,
  view: Record<string, unknown>,
): Promise<SlackApiResult> {
  return callSlack(token, 'views.open', { trigger_id: triggerId, view })
}

export async function viewsOpen(
  orgId: string,
  triggerId: string,
  view: Record<string, unknown>,
): Promise<SlackApiResult | null> {
  const token = await getBotToken(orgId)
  if (!token) return null
  return viewsOpenWithToken(token, triggerId, view)
}

// ── users.lookupByEmail (GET) ────────────────────────────────────────

/**
 * Resolve an email to its Slack user id in the org's workspace, or null if the
 * email isn't a workspace member (a warning is logged — this is the common
 * "DM silently skipped" cause). Prefer the cached resolver in identity.ts;
 * this is the raw live lookup it falls back to.
 */
export async function usersLookupByEmailWithToken(
  token: string,
  email: string,
): Promise<string | null> {
  if (!email) return null
  try {
    const res = await fetch(
      `${SLACK_API}/users.lookupByEmail?email=${encodeURIComponent(email)}`,
      { headers: { Authorization: `Bearer ${token}` } },
    )
    const body = (await res.json()) as SlackApiResult
    if (!body.ok || !body.user?.id) {
      logger.warn('[slack] users.lookupByEmail no match — DM will be skipped', {
        email, slackError: body.error ?? null,
      })
      return null
    }
    return body.user.id
  } catch (err) {
    logger.error('[slack] users.lookupByEmail failed', err)
    return null
  }
}

export async function usersLookupByEmail(orgId: string, email: string): Promise<string | null> {
  const token = await getBotToken(orgId)
  if (!token) return null
  return usersLookupByEmailWithToken(token, email)
}

// ── conversations.list (channel picker) ──────────────────────────────

export interface SlackChannel {
  id: string
  name: string
}

/**
 * List the public channels in the org's workspace for the Settings channel
 * picker. Returns [] if Slack isn't connected or the call fails. Pulls a single
 * page (up to 1000) sorted by name — enough for a dropdown; pagination can be
 * added later if an org outgrows it.
 */
export async function conversationsList(orgId: string): Promise<SlackChannel[]> {
  const token = await getBotToken(orgId)
  if (!token) return []
  try {
    const res = await fetch(
      `${SLACK_API}/conversations.list?types=public_channel&exclude_archived=true&limit=1000`,
      { headers: { Authorization: `Bearer ${token}` } },
    )
    const body = (await res.json()) as SlackApiResult & {
      channels?: Array<{ id: string; name: string }>
    }
    if (!body.ok || !body.channels) {
      logger.warn('[slack] conversations.list failed', { slackError: body.error ?? null })
      return []
    }
    return body.channels
      .map(c => ({ id: c.id, name: c.name }))
      .sort((a, b) => a.name.localeCompare(b.name))
  } catch (err) {
    logger.error('[slack] conversations.list threw', err)
    return []
  }
}

// ── response_url (ephemeral replies to an interaction) ───────────────

/**
 * Post to a Slack interaction `response_url` — used to show the clicker a
 * transient ephemeral message (e.g. "you don't have permission") without
 * destroying the original message. Non-throwing.
 */
export async function postToResponseUrl(
  responseUrl: string,
  body: Record<string, unknown>,
): Promise<void> {
  if (!responseUrl) return
  try {
    await fetch(responseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch (err) {
    logger.error('[slack] response_url post failed', err)
  }
}

// ── users.info (GET) ─────────────────────────────────────────────────

/** Resolve a Slack user id to their profile email, or null. */
export async function usersInfoEmailWithToken(
  token: string,
  slackUserId: string,
): Promise<string | null> {
  try {
    const res = await fetch(
      `${SLACK_API}/users.info?user=${encodeURIComponent(slackUserId)}`,
      { headers: { Authorization: `Bearer ${token}` } },
    )
    const body = (await res.json()) as SlackApiResult
    return body?.user?.profile?.email ?? null
  } catch (err) {
    logger.error('[slack] users.info failed', err)
    return null
  }
}
