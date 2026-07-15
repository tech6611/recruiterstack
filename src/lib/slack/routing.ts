import type { SlackEventKey, SlackEventRouting, SlackRouting } from '@/lib/types/database'

// Built-in routing defaults. These reproduce the pre-hub, hard-coded behaviour
// and MUST stay in sync with the column default in migration 095 so an org that
// has never opened the settings screen sees identical delivery. When a stored
// config omits an event (or the column is null), we fall back to these.
//
// Pure and server-free (no Supabase/notification imports) so it can be unit-tested
// and imported by client components without pulling in server-only modules.
export const DEFAULT_SLACK_ROUTING: Record<SlackEventKey, SlackEventRouting> = {
  candidate_applied: { channel: true, dm_roles: [] },
  stage_moved:       { channel: true, dm_roles: ['hiring_manager'] },
  candidate_hired:   { channel: true, dm_roles: ['hiring_manager'] },
}

// Resolve the effective delivery rule for one event, layering a stored config
// over the built-in default.
export function resolveEventRouting(
  routing: SlackRouting | null | undefined,
  event: SlackEventKey,
): SlackEventRouting {
  return routing?.[event] ?? DEFAULT_SLACK_ROUTING[event]
}
