/**
 * Slack ↔ RecruiterStack identity resolution, backed by the slack_user_map
 * cache (migration 097). Each resolver checks the cache first and only falls
 * back to a live Slack API call on a miss — caching the result so subsequent
 * lookups are free. This is what makes native DMs reliable and lets inbound
 * button clicks be attributed to the right RecruiterStack account.
 *
 * Non-throwing throughout: a cache write failure logs and is ignored; a failed
 * resolution returns null (the caller no-ops, exactly as before).
 */

import { createAdminClient } from '@/lib/supabase/server'
import { logger } from '@/lib/logger'
import {
  getOrgBySlackTeam,
  usersInfoEmailWithToken,
  usersLookupByEmail,
} from './client'

export interface ResolvedSlackUser {
  orgId: string
  userId: string
  email: string
}

/**
 * RecruiterStack user id for an email, scoped to a given org, or null.
 *
 * The same email can exist as several `users` rows — e.g. one per Clerk dev/prod
 * instance, each an admin of a different org. Matching by email alone (and taking
 * an arbitrary row) can pick a user who has no role in the Slack-linked org, so
 * the capability check then wrongly denies them. We therefore disambiguate to the
 * row that is actually a member of THIS org. Case-insensitive.
 */
async function ourUserIdByEmail(orgId: string, email: string): Promise<string | null> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('users')
    .select('id')
    .ilike('email', email) // case-insensitive exact (no wildcards)
  if (error) logger.warn('[slack-identity] users lookup failed', { error: error.message })
  const ids = ((data ?? []) as Array<{ id: string }>).map(u => u.id)
  if (ids.length === 0) return null
  if (ids.length === 1) return ids[0]

  // Duplicate emails across instances → pick the one that belongs to this org.
  const { data: members } = await supabase
    .from('org_members')
    .select('user_id')
    .eq('org_id', orgId)
    .in('user_id', ids)
    .limit(1)
  return ((members ?? []) as Array<{ user_id: string }>)[0]?.user_id ?? ids[0]
}

/** Best-effort upsert into the identity cache. Never throws. */
async function cacheMapping(
  orgId: string,
  userId: string,
  slackUserId: string,
  slackTeamId: string | null,
  email: string | null,
): Promise<void> {
  try {
    const supabase = createAdminClient()
    const { error } = await supabase
      .from('slack_user_map')
      .upsert(
        {
          org_id: orgId,
          user_id: userId,
          slack_user_id: slackUserId,
          slack_team_id: slackTeamId,
          email: email ? email.toLowerCase() : null,
        },
        { onConflict: 'org_id,user_id' },
      )
    if (error) logger.warn('[slack-identity] cache upsert failed', { error: error.message })
  } catch (err) {
    logger.error('[slack-identity] cache upsert threw', err)
  }
}

/**
 * Inbound: resolve a Slack user (identified by their workspace `team.id` and
 * `user.id`) to the RecruiterStack org + user + email. Cache-first; on a miss
 * resolves the email live via users.info, maps it to our user, and caches.
 * Replaces the route's old lookupSlackEmail + ourUserIdByEmail pair.
 */
export async function resolveSlackUser(
  teamId: string,
  slackUserId: string,
): Promise<ResolvedSlackUser | null> {
  const org = await getOrgBySlackTeam(teamId)
  if (!org) {
    logger.warn('[slack-identity] no org for Slack team', { teamId })
    return null
  }

  const supabase = createAdminClient()
  const { data: cached } = await supabase
    .from('slack_user_map')
    .select('user_id, email')
    .eq('org_id', org.orgId)
    .eq('slack_user_id', slackUserId)
    .maybeSingle()
  const hit = cached as { user_id: string; email: string | null } | null
  if (hit?.user_id) {
    return { orgId: org.orgId, userId: hit.user_id, email: hit.email ?? '' }
  }

  // Miss → live resolve, then cache.
  const email = await usersInfoEmailWithToken(org.token, slackUserId)
  if (!email) {
    logger.warn('[slack-identity] users.info returned no email', { teamId, slackUserId })
    return null
  }
  const userId = await ourUserIdByEmail(org.orgId, email)
  if (!userId) {
    logger.warn('[slack-identity] no RecruiterStack user matches Slack email', {
      orgId: org.orgId, email,
    })
    return null
  }

  await cacheMapping(org.orgId, userId, slackUserId, teamId, email)
  return { orgId: org.orgId, userId, email }
}

/**
 * Outbound: resolve an email to a Slack user id for DMing. Cache-first (by
 * email); on a miss does a live users.lookupByEmail and, if the email belongs
 * to a RecruiterStack user, caches the mapping. Emails that aren't workspace
 * members return null (a warning is logged by the client) — the DM is skipped,
 * email/in-app still deliver. External hiring-manager emails with no RS user
 * are resolved live each time (not cacheable — the table requires a user_id).
 */
export async function resolveSlackUserIdByEmail(
  orgId: string,
  email: string,
): Promise<string | null> {
  if (!email) return null

  const supabase = createAdminClient()
  const { data: cached } = await supabase
    .from('slack_user_map')
    .select('slack_user_id')
    .eq('org_id', orgId)
    .eq('email', email.toLowerCase())
    .maybeSingle()
  const hit = cached as { slack_user_id: string } | null
  if (hit?.slack_user_id) return hit.slack_user_id

  const slackUserId = await usersLookupByEmail(orgId, email)
  if (!slackUserId) return null

  // Cache only if this email maps to a real RS user (the table needs user_id).
  const userId = await ourUserIdByEmail(orgId, email)
  if (userId) await cacheMapping(orgId, userId, slackUserId, null, email)
  return slackUserId
}
