import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'
import type { AutomationDecision, PipelineAutomation } from '@/lib/types/pipeline-automations'
import { evaluateConditions, type RuleFacts } from '@/lib/pipeline/rule-eval'
import { describeCondition } from '@/lib/pipeline/rule-fields'
import { fitBucketFor } from '@/lib/ai/fit-bucket'
import {
  updateApplicationStage, updateApplicationStatusInOrg, recordApplicationEventSafe,
} from '@/modules/ats/domain/applications'
import { createSelfScheduleInterview } from '@/modules/ats/domain/interviews'
import { enrollCandidate } from '@/modules/crm/domain/enroll'
import { recordAutomationRunSafe } from '@/modules/ats/domain/pipeline-automations'
import { logger } from '@/lib/logger'

// Phase B: the engine that EVALUATES stage automation rules and (in live mode)
// performs their actions. Runs on the /api/queue/process cron tick. Safety-first:
//   • DRY-RUN BY DEFAULT — unless env PIPELINE_AUTOMATIONS_MODE='live', every rule
//     is only *recorded as a suggestion*; nothing is mutated / no emails go out.
//   • Only mode:'auto' rules ever act (in live mode); suggest/approval always just
//     record a pending suggestion.
//   • CONTINUOUS + idempotent: every enabled rule is re-checked each tick and fires
//     the moment its conditions hold — once per candidacy (automation_runs ledger).
//     So a rule's "when" no longer matters; conditions that become true later (e.g.
//     "days in stage > 5", "feedback submitted") still fire.
//   • Per-tick action cap. Every action is logged to automation_runs AND
//     application_events (created_by 'automation'), so it's auditable + reversible.

type Supabase = SupabaseClient<Database>
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LooseSb = any

const APP_BATCH = 300
const MAX_ACTIONS_PER_TICK = 50
// Actions the engine actually performs in live mode. request_approval (and any
// future ones) only ever record a suggestion.
const AUTO_ACTIONS = new Set(['move_stage', 'archive', 'enrol_outreach', 'schedule_interview'])

interface AppRow {
  id: string
  org_id: string
  candidate_id: string
  stage_id: string | null
  ai_score: number | null
  review_status: string | null
  source: string | null
  applied_at: string | null
  knockout_failed: boolean | null
  job_id: string | null
}

const APP_COLS = 'id, org_id, candidate_id, stage_id, ai_score, review_status, source, applied_at, knockout_failed, job_id'
// Deploy-safe fallback: review_status (migration 030) may be absent on a DB that
// missed that migration. Selecting a missing column by name makes PostgREST hard-
// error and returns ZERO rows — silently disabling ALL automation. So if the full
// select errors on review_status, retry without it (that one fact just reads null).
const APP_COLS_NO_REVIEW = 'id, org_id, candidate_id, stage_id, ai_score, source, applied_at, knockout_failed, job_id'

/** Fetch active candidacies in the given stages, tolerant of a missing
 *  review_status column. Returns { data, error, degraded }. */
async function fetchActiveApps(sb: LooseSb, stageIds: string[]): Promise<{ data: AppRow[]; error: string | null; degraded: boolean }> {
  if (!stageIds.length) return { data: [], error: null, degraded: false }
  const q = (cols: string) => sb.from('applications').select(cols).in('stage_id', stageIds).eq('status', 'active').limit(APP_BATCH)
  let res = await q(APP_COLS)
  let degraded = false
  if (res.error && /review_status/.test(res.error.message ?? '')) {
    degraded = true
    res = await q(APP_COLS_NO_REVIEW)
  }
  return { data: (res.data ?? []) as AppRow[], error: res.error?.message ?? null, degraded }
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

  // Interview feedback = a scorecard. Latest one gives the verdict; existence is
  // "feedback submitted".
  const { data: sc } = await sb.from('scorecards')
    .select('recommendation').eq('application_id', app.id)
    .order('created_at', { ascending: false }).limit(1).maybeSingle()

  // Outreach state for the lead funnel. Enrolments are keyed by candidate (not
  // application): 'enrolled' = in any sequence; 'replied' = they wrote back
  // (set externally via SendGrid Inbound Parse → enrolment.status='replied').
  let enrolled = false, replied = false
  if (app.candidate_id) {
    const { data: enrs } = await sb.from('sequence_enrollments')
      .select('status').eq('org_id', app.org_id).eq('candidate_id', app.candidate_id)
    const statuses = ((enrs ?? []) as { status: string | null }[]).map(e => e.status)
    enrolled = statuses.length > 0
    replied = statuses.includes('replied')
  }

  return {
    days_in_stage: days,
    ai_score: app.ai_score ?? null,
    fit_bucket: app.ai_score != null ? fitBucketFor(app.ai_score) : null,
    review_status: app.review_status ?? null,
    has_feedback: !!sc,
    feedback_result: sc?.recommendation ?? null,
    source: app.source ?? null,
    missing_must_have: app.knockout_failed === true,
    enrolled,
    replied,
  }
}

/** Does a run in any of `states` already exist for (rule, candidacy)? A live
 *  action skips only on a prior COMMITTED run (a dry-run suggestion never blocks a
 *  real action); a suggestion skips on any prior run (dry-run doesn't spam). */
async function runExists(sb: LooseSb, orgId: string, ruleId: string, appId: string, states: string[]): Promise<boolean> {
  const { data } = await sb.from('automation_runs')
    .select('id').eq('org_id', orgId).eq('automation_id', ruleId).eq('application_id', appId)
    .in('state', states).limit(1).maybeSingle()
  return !!data
}

function rationaleFor(rule: PipelineAutomation): string {
  const conds = rule.config?.conditions ?? []
  if (!conds.length) return 'In this stage'
  const joiner = (rule.config?.match ?? 'all') === 'all' ? ' and ' : ' or '
  return conds.map(c => describeCondition(c.field, c.operator, c.value)).join(joiner)
}

function intendedDecision(action: string): AutomationDecision {
  if (action === 'move_stage') return 'advanced'
  if (action === 'archive') return 'rejected'
  if (action === 'request_approval') return 'escalated'
  return 'acted'
}

// ── action: send a self-schedule screening invite + email the candidate ──────
async function scheduleScreeningCall(sb: LooseSb, app: AppRow): Promise<void> {
  const { randomBytes } = await import('crypto')
  const token = randomBytes(20).toString('hex')
  const expires = new Date(); expires.setDate(expires.getDate() + 7)
  const placeholder = new Date(); placeholder.setDate(placeholder.getDate() + 7)

  // Pull the stage's interview panel (migration 132) so the self-schedule link
  // fits the whole panel's availability and calendar invites reach all of them.
  let panel: Array<{ name: string; email: string }> | null = null
  if (app.stage_id) {
    const { data: st } = await sb.from('pipeline_stages')
      .select('interview_panel').eq('org_id', app.org_id).eq('id', app.stage_id).maybeSingle()
    const p = st?.interview_panel
    if (Array.isArray(p) && p.length) {
      panel = p.map((m: { name?: string; email?: string }) => ({ name: (m.name ?? '').trim(), email: (m.email ?? '').trim() }))
        .filter((m: { email: string }) => m.email)
      if (!panel.length) panel = null
    }
  }
  const hasPanel = !!panel

  await createSelfScheduleInterview(sb as unknown as Supabase, app.org_id, {
    application_id: app.id, candidate_id: app.candidate_id, hiring_request_id: null,
    interviewer_name: panel?.[0]?.name || 'Screening',
    interview_type: hasPanel ? 'video' : 'phone',
    scheduled_at: placeholder.toISOString(), duration_minutes: hasPanel ? 45 : 30, status: 'scheduled',
    self_schedule_token: token, self_schedule_expires_at: expires.toISOString(),
    panel, interviewer_email: panel?.[0]?.email ?? null,
  } as never)

  await recordApplicationEventSafe(sb as unknown as Supabase, {
    org_id: app.org_id, application_id: app.id, event_type: 'interview_scheduled',
    note: 'Screening call self-schedule invite sent by an automation rule',
    created_by: 'automation',
  } as never)

  // Email the candidate the link (best-effort; needs SendGrid + a candidate email).
  const { data: c } = await sb.from('candidates')
    .select('email, person:people(email)').eq('id', app.candidate_id).maybeSingle()
  const email: string | null = c?.person?.email ?? c?.email ?? null
  const apiKey = process.env.SENDGRID_API_KEY
  const fromEmail = process.env.SENDGRID_FROM_EMAIL
  if (email && apiKey && fromEmail) {
    try {
      const sgMail = (await import('@sendgrid/mail')).default
      sgMail.setApiKey(apiKey)
      const link = `${process.env.NEXT_PUBLIC_APP_URL || ''}/schedule/${token}`
      await sgMail.send({
        to: email,
        from: { email: fromEmail, name: 'RecruiterStack' },
        subject: 'Schedule your screening call',
        text: `Hi,\n\nWe'd love to set up a quick screening call. Please pick a time that works for you:\n\n${link}\n\nThanks!`,
        html: `<p>Hi,</p><p>We'd love to set up a quick screening call. Please pick a time that works for you:</p><p style="margin:24px 0;"><a href="${link}" style="background:#4f46e5;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block;">Pick a time →</a></p><p style="color:#64748b;font-size:13px;">Or paste this link: ${link}</p>`,
      })
    } catch (err) {
      logger.error('Screening-invite email failed', { err, appId: app.id })
    }
  }
}

type Outcome = 'acted' | 'suggested' | 'skip'

// ── execute one rule against one candidacy ──────────────────────────────────
async function executeRule(sb: Supabase, rule: PipelineAutomation, app: AppRow, facts: RuleFacts, live: boolean): Promise<Outcome> {
  if (!evaluateConditions(facts, rule.config?.conditions, rule.config?.match ?? 'all')) return 'skip'

  const willAct = live && rule.mode === 'auto' && AUTO_ACTIONS.has(rule.action_type)

  // Idempotency: don't re-act / re-suggest on the same candidacy.
  const lsb = sb as unknown as LooseSb
  if (await runExists(lsb, app.org_id, rule.id, app.id, willAct ? ['committed'] : ['committed', 'pending'])) return 'skip'

  const rationale = rationaleFor(rule)

  // Suggestion path: dry-run, non-auto mode, or a non-mutating action.
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
    switch (rule.action_type) {
      case 'move_stage': {
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
        break
      }
      case 'archive': {
        await updateApplicationStatusInOrg(sb, app.org_id, app.id, 'rejected')
        await recordApplicationEventSafe(sb, {
          org_id: app.org_id, application_id: app.id, event_type: 'status_changed',
          note: 'Archived by an automation rule', created_by: 'automation',
        } as never)
        decision = 'rejected'
        break
      }
      case 'enrol_outreach': {
        const sequenceId = rule.config?.sequence_id
        if (!sequenceId) return 'skip'
        await enrollCandidate(lsb, {
          orgId: app.org_id, sequenceId: String(sequenceId), candidateId: app.candidate_id,
          applicationId: app.id, enrolledBy: 'automation',
        })
        decision = 'acted'
        break
      }
      case 'schedule_interview': {
        await scheduleScreeningCall(lsb, app)
        decision = 'acted'
        break
      }
      default:
        return 'skip'
    }
  } catch (err) {
    logger.error('Automation action failed', { err, ruleId: rule.id, appId: app.id, action: rule.action_type })
    return 'skip'
  }

  await recordAutomationRunSafe(sb, app.org_id, {
    automation_id: rule.id, application_id: app.id, action_type: rule.action_type,
    decision, rationale, confidence: null, state: 'committed', commit_at: new Date().toISOString(),
  })
  logger.info('Automation acted', { ruleId: rule.id, appId: app.id, action: rule.action_type, decision })
  return 'acted'
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

  let acted = 0, suggested = 0
  const bump = (o: Outcome) => { if (o === 'acted') acted++; else if (o === 'suggested') suggested++ }
  const capped = () => acted + suggested >= MAX_ACTIONS_PER_TICK

  // Every rule is evaluated continuously against the active candidacies sitting in
  // its stage, and fires the moment its conditions hold (idempotent, once each).
  const stageIds = Array.from(new Set(rules.map(r => r.stage_id)))
  const { data: apps, degraded } = await fetchActiveApps(sb, stageIds)
  if (degraded) logger.warn('Pipeline engine running without review_status column (migration 030 not applied)')

  for (const app of apps) {
    if (capped()) break
    const forStage = rules.filter(r => r.stage_id === app.stage_id && r.org_id === app.org_id)
    if (!forStage.length) continue
    const facts = await buildFacts(sb, app)
    for (const rule of forStage) {
      if (capped()) break
      bump(await executeRule(supabase, rule, app, facts, live))
    }
  }

  if (acted || suggested) logger.info('Pipeline automations scanned', { acted, suggested, live })
  return { acted, suggested, live }
}

// ── Read-only diagnostic: "why aren't my rules firing?" ─────────────────────
// Mirrors scanPipelineAutomations' exact queries + evaluation, but performs NO
// action and SURFACES the errors the engine silently swallows. Pass an ADMIN
// client (createAdminClient) so it sees exactly what the engine sees.
export async function diagnoseJobAutomations(
  supabase: Supabase,
  orgId: string,
  jobId: string,
): Promise<Record<string, unknown>> {
  const sb = supabase as unknown as LooseSb
  const live = process.env.PIPELINE_AUTOMATIONS_MODE === 'live'

  // (1) rules — same query the engine runs (all enabled), + capture any error.
  const rulesRes = await sb.from('pipeline_automations').select('*').eq('enabled', true)
  const allRules = (rulesRes.data ?? []) as PipelineAutomation[]
  const jobRules = allRules.filter(r => r.job_id === jobId)

  // (2) apps — the engine's exact query (active apps in the rules' stages), + error.
  const stageIds = Array.from(new Set(jobRules.map(r => r.stage_id)))
  const appsRes = await fetchActiveApps(sb, stageIds)
  const rawApps = appsRes.data
  const jobApps = rawApps.filter(a => a.job_id === jobId)

  // (3) per candidate × rule: facts + matched/why.
  const evaluations: Array<Record<string, unknown>> = []
  for (const app of jobApps) {
    let facts: RuleFacts
    try { facts = await buildFacts(sb, app) } catch (err) {
      evaluations.push({ application_id: app.id, facts_error: err instanceof Error ? err.message : String(err) })
      continue
    }
    for (const rule of jobRules.filter(r => r.stage_id === app.stage_id && r.org_id === app.org_id)) {
      evaluations.push({
        application_id: app.id,
        stage_id: app.stage_id,
        rule_id: rule.id,
        action: rule.action_type,
        mode: rule.mode,
        conditions: (rule.config?.conditions ?? []).map(c => describeCondition(c.field, c.operator, c.value)),
        matched: evaluateConditions(facts, rule.config?.conditions, rule.config?.match ?? 'all'),
        would_act_live: live && rule.mode === 'auto' && AUTO_ACTIONS.has(rule.action_type),
        facts,
      })
    }
  }

  return {
    live,
    rules_query_error: rulesRes.error?.message ?? null,
    apps_query_error: appsRes.error,
    review_status_column_missing: appsRes.degraded,
    rules_loaded_total: allRules.length,
    rules_for_this_job: jobRules.length,
    rule_stage_ids: stageIds,
    active_apps_in_those_stages_raw: rawApps.length,
    active_apps_for_this_job: jobApps.length,
    org_id_seen: orgId,
    sample_app_orgs: rawApps.slice(0, 5).map(a => ({ id: a.id, org_id: a.org_id, stage_id: a.stage_id, status_active_assumed: true })),
    evaluations,
  }
}
