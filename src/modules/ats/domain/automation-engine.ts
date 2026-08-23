import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'
import type { AutomationDecision, PipelineAutomation } from '@/lib/types/pipeline-automations'
import { evaluateConditions, type RuleFacts } from '@/lib/pipeline/rule-eval'
import { describeCondition } from '@/lib/pipeline/rule-fields'
import { fitBucketFor } from '@/lib/ai/fit-bucket'
import {
  updateApplicationStage, updateApplicationStatusInOrg, recordApplicationEventSafe,
} from '@/modules/ats/domain/applications'
import { recordAutomationRunSafe } from '@/modules/ats/domain/pipeline-automations'
import { logger } from '@/lib/logger'

// Phase B: the engine that EVALUATES stage automation rules and (in live mode)
// performs their actions. Runs on the /api/queue/process cron tick, alongside
// scanAutomations. Safety-first:
//   • DRY-RUN BY DEFAULT — unless env PIPELINE_AUTOMATIONS_MODE='live', every
//     rule is only *recorded as a suggestion*; nothing is mutated. This lets us
//     watch what it WOULD do on prod before letting it act.
//   • Only mode:'auto' rules ever mutate (in live mode); suggest/approval always
//     just record a pending run.
//   • Idempotent (time-based rules skip candidates they've already acted on).
//   • Per-tick action cap. Every action is logged to automation_runs AND
//     application_events (created_by 'automation'), so it's auditable + reversible.

type Supabase = SupabaseClient<Database>
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LooseSb = any

const EVENT_BATCH = 200
const SLA_BATCH = 200
const MAX_ACTIONS_PER_TICK = 50
// Actions the engine will actually perform in live mode. Others (send_email,
// request_approval, screen, …) only ever record a suggestion for now.
const AUTO_ACTIONS = new Set(['move_stage', 'archive'])

interface AppRow {
  id: string
  org_id: string
  stage_id: string | null
  ai_score: number | null
  review_status: string | null
  source: string | null
  applied_at: string | null
  knockout_failed: boolean | null
  job_id: string | null
}

const APP_COLS = 'id, org_id, stage_id, ai_score, review_status, source, applied_at, knockout_failed, job_id'

// ── cursor (mirrors crm/automations.ts) ─────────────────────────────────────
async function getCursor(sb: LooseSb, key: string): Promise<string> {
  const { data } = await sb.from('automation_scan_state').select('last_scanned_at').eq('scan_key', key).maybeSingle()
  if (data?.last_scanned_at) return data.last_scanned_at
  const now = new Date().toISOString()
  await sb.from('automation_scan_state').upsert({ scan_key: key, last_scanned_at: now, updated_at: now }, { onConflict: 'scan_key' })
  return now
}
async function setCursor(sb: LooseSb, key: string, ts: string): Promise<void> {
  await sb.from('automation_scan_state').upsert({ scan_key: key, last_scanned_at: ts, updated_at: new Date().toISOString() }, { onConflict: 'scan_key' })
}

// ── facts ───────────────────────────────────────────────────────────────────
async function buildFacts(sb: LooseSb, app: AppRow): Promise<RuleFacts> {
  // Days in the current stage: since the latest stage-entry event for this stage,
  // else since applied_at.
  let since: string | null = app.applied_at
  if (app.stage_id) {
    const { data: ev } = await sb.from('application_events')
      .select('created_at').eq('application_id', app.id).eq('to_stage', app.stage_id)
      .order('created_at', { ascending: false }).limit(1).maybeSingle()
    if (ev?.created_at) since = ev.created_at
  }
  const days = since ? Math.floor((Date.now() - new Date(since).getTime()) / 86_400_000) : 0

  const { count } = await sb.from('interviews')
    .select('id', { count: 'exact', head: true }).eq('application_id', app.id).eq('status', 'completed')

  return {
    days_in_stage: days,
    ai_score: app.ai_score ?? null,
    fit_bucket: app.ai_score != null ? fitBucketFor(app.ai_score) : null,
    review_status: app.review_status ?? null,
    has_feedback: (count ?? 0) > 0,
    source: app.source ?? null,
    missing_must_have: app.knockout_failed === true,
  }
}

/** Does a run in any of `states` already exist for (rule, candidacy)? Used for
 *  time-based idempotency. Mode-aware at the call site: a live action skips only
 *  on a prior COMMITTED run (so a dry-run suggestion never blocks a real action);
 *  a suggestion skips on any prior run (so dry-run doesn't spam every tick). */
async function runExists(sb: LooseSb, orgId: string, ruleId: string, appId: string, states: string[]): Promise<boolean> {
  const { data } = await sb.from('automation_runs')
    .select('id').eq('org_id', orgId).eq('automation_id', ruleId).eq('application_id', appId)
    .in('state', states).limit(1).maybeSingle()
  return !!data
}

function rationaleFor(rule: PipelineAutomation): string {
  const conds = rule.config?.conditions ?? []
  if (!conds.length) return `On ${rule.trigger === 'sla_elapsed' ? 'time in stage' : 'stage entry'}`
  const joiner = (rule.config?.match ?? 'all') === 'all' ? ' and ' : ' or '
  return conds.map(c => describeCondition(c.field, c.operator, c.value)).join(joiner)
}

type Outcome = 'acted' | 'suggested' | 'skip'

// ── execute one rule against one candidacy ──────────────────────────────────
async function executeRule(
  sb: Supabase, rule: PipelineAutomation, app: AppRow, facts: RuleFacts, live: boolean,
  checkIdempotency: boolean,
): Promise<Outcome> {
  if (!evaluateConditions(facts, rule.config?.conditions, rule.config?.match ?? 'all')) return 'skip'

  const willAct = live && rule.mode === 'auto' && AUTO_ACTIONS.has(rule.action_type)

  // Time-based idempotency: don't re-act / re-suggest on the same candidacy.
  if (checkIdempotency) {
    const lsb = sb as unknown as LooseSb
    const already = await runExists(lsb, app.org_id, rule.id, app.id, willAct ? ['committed'] : ['committed', 'pending'])
    if (already) return 'skip'
  }

  const rationale = rationaleFor(rule)

  // Suggestion path: dry-run, or non-auto mode, or a non-mutating action.
  if (!willAct) {
    await recordAutomationRunSafe(sb, app.org_id, {
      automation_id: rule.id, application_id: app.id, action_type: rule.action_type,
      decision: intendedDecision(rule.action_type), rationale, confidence: null,
      state: 'pending', commit_at: null,
    })
    return 'suggested'
  }

  // Live auto action.
  let decision: AutomationDecision = 'acted'
  try {
    if (rule.action_type === 'move_stage') {
      const target = rule.config?.target_stage_id
      if (!target || target === app.stage_id) return 'skip'
      const { error } = await updateApplicationStage(sb, app.org_id, app.id, String(target))
      if (error) throw new Error(error.message)
      await recordApplicationEventSafe(sb, {
        org_id: app.org_id, application_id: app.id, event_type: 'stage_moved',
        from_stage: app.stage_id, to_stage: String(target),
        note: 'Moved by an automation rule', created_by: 'automation',
      } as never)
      decision = 'advanced'
    } else if (rule.action_type === 'archive') {
      await updateApplicationStatusInOrg(sb, app.org_id, app.id, 'rejected')
      await recordApplicationEventSafe(sb, {
        org_id: app.org_id, application_id: app.id, event_type: 'status_changed',
        note: 'Archived by an automation rule', created_by: 'automation',
      } as never)
      decision = 'rejected'
    }
  } catch (err) {
    logger.error('Automation action failed', { err, ruleId: rule.id, appId: app.id })
    return 'skip'
  }

  await recordAutomationRunSafe(sb, app.org_id, {
    automation_id: rule.id, application_id: app.id, action_type: rule.action_type,
    decision, rationale, confidence: null, state: 'committed', commit_at: new Date().toISOString(),
  })
  logger.info('Automation acted', { ruleId: rule.id, appId: app.id, action: rule.action_type, decision })
  return 'acted'
}

function intendedDecision(action: string): AutomationDecision {
  if (action === 'move_stage') return 'advanced'
  if (action === 'archive') return 'rejected'
  if (action === 'request_approval') return 'escalated'
  return 'held'
}

// ── the scan (called on the cron tick) ──────────────────────────────────────
export async function scanPipelineAutomations(
  supabase: Supabase,
): Promise<{ acted: number; suggested: number; live: boolean }> {
  const sb = supabase as unknown as LooseSb
  const live = process.env.PIPELINE_AUTOMATIONS_MODE === 'live'

  const { data: ruleRows } = await sb.from('pipeline_automations').select('*').eq('enabled', true)
  const rules = (ruleRows ?? []) as PipelineAutomation[]
  if (!rules.length) return { acted: 0, suggested: 0, live }

  const entryRules = rules.filter(r => r.trigger === 'stage_entry')
  const slaRules = rules.filter(r => r.trigger === 'sla_elapsed')
  let acted = 0, suggested = 0
  const bump = (o: Outcome) => { if (o === 'acted') acted++; else if (o === 'suggested') suggested++ }
  const capped = () => acted + suggested >= MAX_ACTIONS_PER_TICK

  // ENTRY rules: cursor scan of new stage-entry events. Each event is processed
  // once (the cursor advances), so no per-run idempotency is needed here.
  if (entryRules.length) {
    const cursor = await getCursor(sb, 'pipeline_stage_entry')
    const { data: events } = await sb.from('application_events')
      .select('application_id, to_stage, created_at')
      .in('event_type', ['stage_moved', 'applied']).gt('created_at', cursor)
      .order('created_at', { ascending: true }).limit(EVENT_BATCH)
    let maxTs = cursor
    for (const ev of (events ?? [])) {
      if (ev.created_at > maxTs) maxTs = ev.created_at
      const forStage = entryRules.filter(r => r.stage_id === ev.to_stage)
      if (!forStage.length || capped()) continue
      const { data: app } = await sb.from('applications').select(APP_COLS).eq('id', ev.application_id).maybeSingle()
      if (!app) continue
      const facts = await buildFacts(sb, app as AppRow)
      for (const rule of forStage) {
        if (capped()) break
        if (rule.org_id !== (app as AppRow).org_id) continue
        bump(await executeRule(supabase, rule, app as AppRow, facts, live, false))
      }
    }
    if ((events ?? []).length) await setCursor(sb, 'pipeline_stage_entry', maxTs)
  }

  // TIME-BASED rules: scan active candidacies sitting in stages that have such
  // rules. Idempotent via automation_runs so a rule fires once per candidacy.
  if (slaRules.length && !capped()) {
    const stageIds = Array.from(new Set(slaRules.map(r => r.stage_id)))
    const { data: apps } = await sb.from('applications')
      .select(APP_COLS).in('stage_id', stageIds).eq('status', 'active').limit(SLA_BATCH)
    for (const app of (apps ?? []) as AppRow[]) {
      if (capped()) break
      const forStage = slaRules.filter(r => r.stage_id === app.stage_id && r.org_id === app.org_id)
      if (!forStage.length) continue
      const facts = await buildFacts(sb, app)
      for (const rule of forStage) {
        if (capped()) break
        bump(await executeRule(supabase, rule, app, facts, live, true))
      }
    }
  }

  if (acted || suggested) logger.info('Pipeline automations scanned', { acted, suggested, live })
  return { acted, suggested, live }
}
