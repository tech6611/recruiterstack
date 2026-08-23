// Types for "Pipeline Plans & Automation Agents" (Slice 1a).
// These mirror the tables added in migration 123. The tables are not in the
// generated Database types yet (we use LooseSb casts in the facade, per the
// candidate_ai_summaries convention), so these hand-written interfaces are the
// contract the rest of the app codes against.

import type { StageZone } from '@/lib/pipeline/zones'

/** Where a candidacy sits in the funnel lifecycle. Defaults to 'active'; the
 *  Lead zone (Slice 5) sets sourced/outreach candidacies to 'lead'. */
export type ApplicationLifecycle = 'lead' | 'active' | 'completed'

/** What an automation fires on. `stage_entry` is the Ashby model (and the only
 *  one wired in early slices); the others are reserved for later. */
export type AutomationTrigger = 'stage_entry' | 'feedback_complete' | 'sla_elapsed'

/** The action an automation performs. Each binds to an existing tool/facade. */
export type AutomationActionType =
  | 'enrol_outreach'
  | 'promote_lead'
  | 'screen'
  | 'send_email'
  | 'send_assessment'
  | 'schedule_interview'
  | 'request_availability'
  | 'handoff_to_hm'
  | 'move_stage'
  | 'create_offer'
  | 'archive'
  | 'request_approval'

/** The autonomy dial. `auto` acts within guardrails; `suggest` proposes and
 *  waits; `approval_required` routes through a human sign-off. */
export type AutomationMode = 'auto' | 'suggest' | 'approval_required'

/** Where a rejected candidate goes. */
export type RejectDestination = 'archive' | 'hold' | 'review'

// ── Conditional rules ("text operators") ────────────────────────────────────
// A rule = WHEN (trigger) · IF (conditions) · THEN (action). The IF clauses are
// stored in pipeline_automations.config; see rule-fields.ts for field metadata.

/** A field a rule condition can test about a candidacy. */
export type RuleField =
  | 'days_in_stage'
  | 'ai_score'
  | 'fit_bucket'
  | 'review_status'
  | 'has_feedback'
  | 'feedback_result'
  | 'source'
  | 'missing_must_have'

/** Comparison operators — which apply depends on the field's type. */
export type RuleOperator =
  | 'gt' | 'gte' | 'lt' | 'lte' | 'eq' | 'neq' // numbers
  | 'is' | 'is_not'                             // choices
  | 'is_true' | 'is_false'                      // yes/no

/** How multiple conditions combine. */
export type ConditionMatch = 'all' | 'any'

/** One IF clause: field <operator> value. `value` is omitted for boolean ops. */
export interface RuleCondition {
  field: RuleField
  operator: RuleOperator
  value?: string | number
}

/** Structured contents of pipeline_automations.config for a conditional rule. */
export interface AutomationConfig {
  conditions?: RuleCondition[]
  match?: ConditionMatch
  /** For action_type 'move_stage': where to move. */
  target_stage_id?: string | null
  /** For action_type 'enrol_outreach': which sequence to add the candidate to. */
  sequence_id?: string | null
  /** For action_type 'send_email' (later). */
  email_template_id?: string | null
  [k: string]: unknown
}

/** What an agent decided on a run. */
export type AutomationDecision = 'advanced' | 'rejected' | 'held' | 'escalated' | 'acted'

/** Lifecycle of a single run row (drives the undo window + audit). */
export type AutomationRunState = 'pending' | 'committed' | 'cancelled' | 'reverted'

/** The recruiter's plain-English sketch for one stage. */
export interface StagePlaybook {
  id: string
  org_id: string
  stage_id: string
  entry_intent: string | null
  advance_criteria: string | null
  next_stage_id: string | null
  reject_to: RejectDestination
  created_at: string
  updated_at: string
}

/** Editable fields the client sends when saving a stage's playbook. */
export interface StagePlaybookInput {
  entry_intent?: string | null
  advance_criteria?: string | null
  next_stage_id?: string | null
  reject_to?: RejectDestination
}

/** Optional safety knobs stored on pipeline_automations.guardrails. All optional;
 *  the agent runtime (later slices) applies sensible defaults when absent. */
export interface AutomationGuardrails {
  /** Seconds an auto action stays cancellable before it commits (undo window). */
  undo_window_seconds?: number
  /** Minimum confidence [0..1] an agent decision needs to act; below → escalate. */
  confidence_floor?: number
  /** Block advancing past this stage until required feedback exists. */
  requires_feedback?: boolean
  /** Max auto actions this rule may take per day (0/undefined = uncapped). */
  daily_cap?: number
}

/** A trigger→action rule attached to a stage. */
export interface PipelineAutomation {
  id: string
  org_id: string
  job_id: string
  stage_id: string
  trigger: AutomationTrigger
  action_type: AutomationActionType
  uses_agent: boolean
  mode: AutomationMode
  config: AutomationConfig
  guardrails: AutomationGuardrails
  enabled: boolean
  created_by: string | null
  created_at: string
  updated_at: string
}

/** Editable fields when creating/updating an automation. */
export interface PipelineAutomationInput {
  stage_id: string
  trigger?: AutomationTrigger
  action_type: AutomationActionType
  uses_agent?: boolean
  mode?: AutomationMode
  config?: AutomationConfig
  guardrails?: AutomationGuardrails
  enabled?: boolean
}

/** An append-only record of one autonomous (or proposed) action. */
export interface AutomationRun {
  id: string
  org_id: string
  automation_id: string | null
  application_id: string
  action_type: AutomationActionType
  decision: AutomationDecision | null
  rationale: string | null
  confidence: number | null
  state: AutomationRunState
  commit_at: string | null
  created_at: string
}

/** A member of a stage's interview panel (migration 132). */
export interface PanelMember {
  name: string
  email: string
}

/** An automation run enriched for the activity panel. */
export interface AutomationRunView extends AutomationRun {
  candidate_name: string | null
}

/** A stage enriched with its zone + gate flag (migration 123), its canonical
 *  funnel step (migration 131), a live candidate count, and optionally its
 *  playbook. Used by the plan editor + Leads view. */
export interface ZonedStage {
  id: string
  name: string
  order_index: number
  zone: StageZone
  is_promotion_gate: boolean
  funnel_step: string | null
  candidate_count: number
  interview_panel: PanelMember[] | null
  playbook?: StagePlaybook | null
}
