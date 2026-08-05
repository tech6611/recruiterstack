import { createAdminClient } from '@/lib/supabase/server'
import { notifySlack, notifySlackDM } from '@/lib/notifications'
import { resolveEventRouting } from '@/lib/slack/routing'
import { buildLifecycleBlocks } from '@/lib/slack/blocks'
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

// The single Slack routing gate. Every routed lifecycle event flows through here:
// it reads the org's per-event config, then fans out to the channel webhook and/or
// role DMs accordingly. Non-throwing and fire-and-forget, like the underlying
// notify helpers — a Slack failure never blocks the caller's API response.
export async function dispatchSlackEvent(params: DispatchParams): Promise<void> {
  const { orgId, event, text, applicationId } = params
  const supabase = createAdminClient()

  const { data } = await supabase
    .from('org_settings')
    .select('slack_routing')
    .eq('org_id', orgId)
    .maybeSingle()

  const routing = resolveEventRouting(
    (data as { slack_routing: SlackRouting | null } | null)?.slack_routing ?? null,
    event,
  )

  const tasks: Promise<void>[] = []

  if (routing.channel) {
    tasks.push(notifySlack(orgId, text))
  }

  if (applicationId && routing.dm_roles.length > 0) {
    // Rich, interactive DM: the same summary text plus Move-stage / Add-note /
    // Open buttons (handled by /api/slack/interactions). Channel posts stay
    // plain-text via the webhook. candidate_id (best-effort) powers the Open
    // link; a miss just drops that one button.
    const { data: appInfo } = await getApplicationCandidateIdAndJob(supabase, orgId, applicationId)
    const blocks = buildLifecycleBlocks({
      event, text, applicationId,
      candidateId: (appInfo as { candidate_id?: string } | null)?.candidate_id ?? null,
    })

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
