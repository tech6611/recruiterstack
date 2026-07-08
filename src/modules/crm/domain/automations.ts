import type { SupabaseClient } from '@supabase/supabase-js'
import { logger } from '@/lib/logger'
import { enrollCandidate } from './enroll'

export type TriggerType = 'tag_added' | 'stage_moved' | 'applied' | 'status_changed'

export interface EnrollmentRule {
  id: string
  org_id: string
  name: string
  enabled: boolean
  trigger_type: TriggerType
  trigger_value: string
  sequence_id: string
}

// Max events processed per trigger per scan tick (keeps the cron call bounded).
const BATCH = 200

// ── Pure matchers (unit-tested) ───────────────────────────────────────────────

export function matchTagRules(rules: EnrollmentRule[], orgId: string, tag: string): EnrollmentRule[] {
  return rules.filter(r =>
    r.enabled && r.trigger_type === 'tag_added' && r.org_id === orgId && r.trigger_value === tag)
}

export function matchStageRules(rules: EnrollmentRule[], orgId: string, toStage: string): EnrollmentRule[] {
  return rules.filter(r =>
    r.enabled && r.trigger_type === 'stage_moved' && r.org_id === orgId && r.trigger_value === toStage)
}

export function matchStatusRules(rules: EnrollmentRule[], orgId: string, toStatus: string): EnrollmentRule[] {
  return rules.filter(r =>
    r.enabled && r.trigger_type === 'status_changed' && r.org_id === orgId && r.trigger_value === toStatus)
}

// "applied" fires on any new application for the org — trigger_value is ignored.
export function matchAppliedRules(rules: EnrollmentRule[], orgId: string): EnrollmentRule[] {
  return rules.filter(r =>
    r.enabled && r.trigger_type === 'applied' && r.org_id === orgId)
}

// ── Cursor helpers ────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getCursor(supabase: SupabaseClient<any>, key: string): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase.from('automation_scan_state') as any)
    .select('last_scanned_at').eq('scan_key', key).maybeSingle()
  if (data?.last_scanned_at) return data.last_scanned_at
  // First time we see this trigger — start the clock at "now" so rules only act
  // on events going forward, never retroactively on historical events.
  const now = new Date().toISOString()
  await setCursor(supabase, key, now)
  return now
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function setCursor(supabase: SupabaseClient<any>, key: string, ts: string): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase.from('automation_scan_state') as any)
    .upsert({ scan_key: key, last_scanned_at: ts, updated_at: new Date().toISOString() }, { onConflict: 'scan_key' })
}

// ── application_events scanner (shared by applied / stage_moved / status_changed) ──

/**
 * Poll one application_events event_type since its cursor and enroll matching
 * candidates. `matchFn(rules, orgId, toStage)` picks the rules to fire for an
 * event (applied ignores `toStage`; stage/status match it). Resolves each event
 * to its candidate + org (application_events carries no org_id).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function scanAppEvents(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  rules: EnrollmentRule[],
  eventType: string,
  matchFn: (rules: EnrollmentRule[], orgId: string, toStage: string) => EnrollmentRule[],
): Promise<number> {
  const cursor = await getCursor(supabase, eventType)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: events } = await (supabase.from('application_events') as any)
    .select('application_id, to_stage, created_at')
    .eq('event_type', eventType).gt('created_at', cursor)
    .order('created_at', { ascending: true }).limit(BATCH)

  let maxTs = cursor
  let enrolled = 0
  for (const ev of (events ?? [])) {
    if (ev.created_at > maxTs) maxTs = ev.created_at
    // Resolve application → candidate + org.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: app } = await (supabase.from('applications') as any)
      .select('candidate_id, candidates(org_id)').eq('id', ev.application_id).maybeSingle()
    const candidateId = app?.candidate_id
    const orgId = app?.candidates?.org_id
    if (!candidateId || !orgId) continue
    for (const rule of matchFn(rules, orgId, ev.to_stage ?? '')) {
      const res = await enrollCandidate(supabase, {
        orgId, sequenceId: rule.sequence_id, candidateId, applicationId: ev.application_id, enrolledBy: 'automation',
      })
      if (res.enrolled) {
        enrolled++
        logger.info('Auto-enrolled on application event', { ruleId: rule.id, candidateId, eventType, toStage: ev.to_stage })
      }
    }
  }
  if ((events ?? []).length) await setCursor(supabase, eventType, maxTs)
  return enrolled
}

// ── The scan ──────────────────────────────────────────────────────────────────

/**
 * Poll for new trigger events since the last scan and auto-enroll matching
 * candidates. Idempotent — enrollCandidate skips anyone already active/paused,
 * so re-processing an overlapping window never double-enrolls. Called on the
 * queue-processing cron tick.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function scanAutomations(supabase: SupabaseClient<any>): Promise<Record<string, number>> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: ruleRows } = await (supabase.from('sequence_enrollment_rules') as any)
    .select('*').eq('enabled', true)
  const rules = (ruleRows ?? []) as EnrollmentRule[]
  if (!rules.length) return {}

  const out: Record<string, number> = {}

  // tag_added — polls candidate_tags.
  if (rules.some(r => r.trigger_type === 'tag_added')) {
    const cursor = await getCursor(supabase, 'tag_added')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: tags } = await (supabase.from('candidate_tags') as any)
      .select('org_id, candidate_id, tag, created_at')
      .gt('created_at', cursor).order('created_at', { ascending: true }).limit(BATCH)
    let maxTs = cursor
    let n = 0
    for (const row of (tags ?? [])) {
      if (row.created_at > maxTs) maxTs = row.created_at
      for (const rule of matchTagRules(rules, row.org_id, row.tag)) {
        const res = await enrollCandidate(supabase, {
          orgId: rule.org_id, sequenceId: rule.sequence_id, candidateId: row.candidate_id, enrolledBy: 'automation',
        })
        if (res.enrolled) { n++; logger.info('Auto-enrolled on tag', { ruleId: rule.id, candidateId: row.candidate_id, tag: row.tag }) }
      }
    }
    if ((tags ?? []).length) await setCursor(supabase, 'tag_added', maxTs)
    out.tag_added = n
  }

  // Application-event triggers — all poll application_events.
  if (rules.some(r => r.trigger_type === 'applied')) {
    out.applied = await scanAppEvents(supabase, rules, 'applied', (rs, org) => matchAppliedRules(rs, org))
  }
  if (rules.some(r => r.trigger_type === 'stage_moved')) {
    out.stage_moved = await scanAppEvents(supabase, rules, 'stage_moved', matchStageRules)
  }
  if (rules.some(r => r.trigger_type === 'status_changed')) {
    out.status_changed = await scanAppEvents(supabase, rules, 'status_changed', matchStatusRules)
  }

  return out
}
