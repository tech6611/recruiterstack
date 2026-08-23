// Pipeline zones — the Ashby-style shape of a job's funnel.
//
// A job's stages are grouped into ordered zones: a pre-application LEAD zone, the
// ACTIVE interview pipeline, an OFFER zone, and terminal COMPLETED outcomes. This
// module is the single, pure source of truth for that shape — no DB, no I/O — so
// the migration/backfill, the facade, the guardrails, and the UI all agree on
// zone ordering and on what the seeded lead stages look like.

import type { StageColor } from '@/lib/types/database'

export type StageZone = 'lead' | 'active' | 'offer' | 'completed'

/** Zones in funnel order — earlier = earlier in the candidate journey. */
export const ZONE_SEQUENCE: readonly StageZone[] = ['lead', 'active', 'offer', 'completed'] as const

/** Position of a zone in the funnel (0 = earliest). */
export function zoneRank(zone: StageZone): number {
  return ZONE_SEQUENCE.indexOf(zone)
}

/** True when moving from `from` into `to` goes forward (or stays put) in the
 *  funnel — never backwards across zones. Guardrail R1 (no illegal skips is
 *  enforced separately by next_stage_id; this catches backward zone jumps). */
export function isForwardZoneMove(from: StageZone, to: StageZone): boolean {
  return zoneRank(to) >= zoneRank(from)
}

/** Categorize one of the seeded default stage names into its zone. Custom names
 *  fall through to 'active', the safe default (a recruiter re-zones in the UI).
 *  Mirrors the name-based backfill in migration 123. */
export function defaultZoneForStageName(name: string): StageZone {
  const n = name.trim().toLowerCase()
  if (n === 'new lead' || n === 'reached out' || n === 'replied') return 'lead'
  if (n === 'offer') return 'offer'
  if (n === 'hired' || n === 'rejected' || n === 'archived') return 'completed'
  return 'active'
}

/** Shape of a stage to seed into a job's pipeline. */
export interface StageSeed {
  name: string
  order_index: number
  color: StageColor
  zone: StageZone
  is_promotion_gate: boolean
}

/** The three lead-zone stages, Ashby's lead ladder. Negative order_index keeps
 *  them ahead of the active stages (which start at 0) WITHOUT renumbering any
 *  existing rows — so Slice 1b can seed them into existing job boards
 *  non-destructively. "Replied" is the promotion gate: the stage a lead crosses
 *  from into the active pipeline. */
export const LEAD_STAGE_SEEDS: readonly StageSeed[] = [
  { name: 'New lead',    order_index: -3, color: 'slate', zone: 'lead', is_promotion_gate: false },
  { name: 'Reached out', order_index: -2, color: 'blue',  zone: 'lead', is_promotion_gate: false },
  { name: 'Replied',     order_index: -1, color: 'violet', zone: 'lead', is_promotion_gate: true },
] as const
