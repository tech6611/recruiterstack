/**
 * Slack slash-command handler for `/recruiterstack`.
 *
 * Sub-commands:
 *   search <name or title>  → matching candidates as a Block Kit list
 *   (anything else)         → help
 *
 * Replies synchronously with an **ephemeral** message (only the invoking user
 * sees it) — the search is a single limited query, comfortably inside Slack's
 * 3-second window. The acting Slack user is resolved to a RecruiterStack user
 * (cached) and gated on `recruiting:view`, so results never leak to someone
 * without access.
 */

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getPermissionSet, can } from '@/lib/rbac'
import { resolveSlackUser } from '@/lib/slack/identity'
import { buildSearchResultsBlocks } from '@/lib/slack/blocks'
import { searchCandidatesForAgent } from '@/modules/ats/domain/candidates'
import { listActiveApplicationsByCandidatesWithJobTitle } from '@/modules/ats/domain/applications'

export interface SlashCommandInput {
  teamId: string
  slackUserId: string
  text: string
}

/** An ephemeral text reply (only the invoking user sees it). */
function ephemeral(text: string): NextResponse {
  return NextResponse.json({ response_type: 'ephemeral', text })
}

function helpText(): string {
  return [
    '*RecruiterStack* — available commands:',
    '• `/recruiterstack search <name or title>` — find candidates',
  ].join('\n')
}

export async function handleSlashCommand(input: SlashCommandInput): Promise<NextResponse> {
  const user = await resolveSlackUser(input.teamId, input.slackUserId)
  if (!user) {
    return ephemeral(
      "I couldn't match your Slack account to a RecruiterStack user. " +
      'Make sure your Slack email matches your RecruiterStack login, or ask an admin.',
    )
  }

  const supabase = createAdminClient()
  const caps = await getPermissionSet(supabase, user.orgId, user.userId)
  if (!can(caps, 'recruiting:view')) {
    return ephemeral("You don't have permission to view candidates.")
  }

  const trimmed = input.text.trim()
  const [sub, ...rest] = trimmed.split(/\s+/)
  const arg = rest.join(' ').trim()

  if (sub === 'search') {
    if (!arg) return ephemeral('Usage: `/recruiterstack search <name or title>`')
    return searchCommand(supabase, user.orgId, arg)
  }

  return ephemeral(helpText())
}

async function searchCommand(
  supabase: ReturnType<typeof createAdminClient>,
  orgId: string,
  query: string,
): Promise<NextResponse> {
  const { data, error } = await searchCandidatesForAgent(supabase, orgId, { query })
  if (error) return ephemeral('Sorry — the search failed. Please try again.')
  const rows = data ?? []
  if (rows.length === 0) {
    return NextResponse.json({ response_type: 'ephemeral', blocks: buildSearchResultsBlocks(query, []) })
  }

  // Enrich each candidate with the active jobs they're in.
  const jobRows = await listActiveApplicationsByCandidatesWithJobTitle(
    supabase, orgId, rows.map(r => r.id),
  )
  const jobsByCandidate = new Map<string, string[]>()
  for (const j of jobRows) {
    const title = j.hiring_request?.position_title
    if (!title) continue
    const arr = jobsByCandidate.get(j.candidate_id) ?? []
    arr.push(title)
    jobsByCandidate.set(j.candidate_id, arr)
  }

  const blocks = buildSearchResultsBlocks(
    query,
    rows.map(r => ({
      candidateId: r.id,
      name: r.person?.name ?? 'Unknown',
      title: r.current_title,
      status: r.status,
      jobs: jobsByCandidate.get(r.id) ?? [],
    })),
  )
  return NextResponse.json({ response_type: 'ephemeral', blocks })
}
