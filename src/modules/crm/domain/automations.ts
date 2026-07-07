import type { SupabaseClient } from '@supabase/supabase-js'
import { logger } from '@/lib/logger'
import { enrollCandidate } from './enroll'

export type TriggerType = 'tag_added' | 'stage_moved'

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

// ── Cursor helpers ────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getCursor(supabase: SupabaseClient<any>, key: TriggerType): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase.from('automation_scan_state') as any)
    .select('last_scanned_at').eq('scan_key', key).maybeSingle()
  return data?.last_scanned_at ?? new Date(0).toISOString()
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function setCursor(supabase: SupabaseClient<any>, key: TriggerType, ts: string): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase.from('automation_scan_state') as any)
    .upsert({ scan_key: key, last_scanned_at: ts, updated_at: new Date().toISOString() }, { onConflict: 'scan_key' })
}

// ── The scan ──────────────────────────────────────────────────────────────────

/**
 * Poll for new trigger events since the last scan and auto-enroll matching
 * candidates. Idempotent — enrollCandidate skips anyone already active/paused,
 * so re-processing an overlapping window never double-enrolls. Meant to be
 * called on the queue-processing cron tick.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function scanAutomations(supabase: SupabaseClient<any>): Promise<{ tagEnrolled: number; stageEnrolled: number }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: ruleRows } = await (supabase.from('sequence_enrollment_rules') as any)
    .select('*').eq('enabled', true)
  const rules = (ruleRows ?? []) as EnrollmentRule[]
  if (!rules.length) return { tagEnrolled: 0, stageEnrolled: 0 }

  let tagEnrolled = 0
  let stageEnrolled = 0

  // ── tag_added ──
  if (rules.some(r => r.trigger_type === 'tag_added')) {
    const cursor = await getCursor(supabase, 'tag_added')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: tags } = await (supabase.from('candidate_tags') as any)
      .select('org_id, candidate_id, tag, created_at')
      .gt('created_at', cursor).order('created_at', { ascending: true }).limit(BATCH)
    let maxTs = cursor
    for (const row of (tags ?? [])) {
      if (row.created_at > maxTs) maxTs = row.created_at
      for (const rule of matchTagRules(rules, row.org_id, row.tag)) {
        const res = await enrollCandidate(supabase, {
          orgId: rule.org_id, sequenceId: rule.sequence_id, candidateId: row.candidate_id, enrolledBy: 'automation',
        })
        if (res.enrolled) {
          tagEnrolled++
          logger.info('Auto-enrolled on tag', { ruleId: rule.id, candidateId: row.candidate_id, tag: row.tag })
        }
      }
    }
    if ((tags ?? []).length) await setCursor(supabase, 'tag_added', maxTs)
  }

  // ── stage_moved ──
  if (rules.some(r => r.trigger_type === 'stage_moved')) {
    const cursor = await getCursor(supabase, 'stage_moved')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: events } = await (supabase.from('application_events') as any)
      .select('application_id, to_stage, created_at')
      .eq('event_type', 'stage_moved').gt('created_at', cursor)
      .order('created_at', { ascending: true }).limit(BATCH)
    let maxTs = cursor
    for (const ev of (events ?? [])) {
      if (ev.created_at > maxTs) maxTs = ev.created_at
      if (!ev.to_stage) continue
      // Resolve application → candidate + org (application_events has no org_id).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: app } = await (supabase.from('applications') as any)
        .select('candidate_id, candidates(org_id)').eq('id', ev.application_id).maybeSingle()
      const candidateId = app?.candidate_id
      const orgId = app?.candidates?.org_id
      if (!candidateId || !orgId) continue
      for (const rule of matchStageRules(rules, orgId, ev.to_stage)) {
        const res = await enrollCandidate(supabase, {
          orgId, sequenceId: rule.sequence_id, candidateId, applicationId: ev.application_id, enrolledBy: 'automation',
        })
        if (res.enrolled) {
          stageEnrolled++
          logger.info('Auto-enrolled on stage move', { ruleId: rule.id, candidateId, toStage: ev.to_stage })
        }
      }
    }
    if ((events ?? []).length) await setCursor(supabase, 'stage_moved', maxTs)
  }

  return { tagEnrolled, stageEnrolled }
}
