import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'
import type { StageZone } from '@/lib/pipeline/zones'
import type {
  AutomationRun,
  PipelineAutomation,
  PipelineAutomationInput,
  StagePlaybook,
  StagePlaybookInput,
  ZonedStage,
} from '@/lib/types/pipeline-automations'
import { logger } from '@/lib/logger'

type Supabase = SupabaseClient<Database>

// The Slice-1a tables (migration 123) — stage_playbook, pipeline_automations,
// automation_runs — plus the new pipeline_stages.zone/is_promotion_gate columns
// aren't in the generated Supabase types yet, so use a loose handle (same
// approach as icp.ts / candidate_ai_summaries).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LooseSb = any

// ── Zoned stages (stages + zone/gate + playbook) ────────────────────────────

/** Ordered stages for a job, each carrying its zone + promotion-gate flag and
 *  (optionally) its playbook. This is the shape the plan editor + Leads view
 *  read. Ordered by order_index, so seeded lead stages (negative order_index)
 *  come first. */
export async function getZonedStages(
  supabase: Supabase,
  orgId: string,
  jobId: string,
): Promise<ZonedStage[]> {
  const sb = supabase as unknown as LooseSb
  // Prefer the funnel_step column (migration 131); fall back without it if the
  // column isn't present yet (deploy-safe before 131 is applied).
  let stages: unknown[] | null
  const primary = await sb
    .from('pipeline_stages')
    .select('id, name, order_index, zone, is_promotion_gate, funnel_step')
    .eq('org_id', orgId)
    .eq('job_id', jobId)
    .order('order_index', { ascending: true })
  if (primary.error) {
    const fb = await sb
      .from('pipeline_stages')
      .select('id, name, order_index, zone, is_promotion_gate')
      .eq('org_id', orgId)
      .eq('job_id', jobId)
      .order('order_index', { ascending: true })
    if (fb.error) throw fb.error
    stages = (fb.data ?? []).map((r: Record<string, unknown>) => ({ ...r, funnel_step: null }))
  } else {
    stages = primary.data ?? []
  }

  const rows = (stages ?? []) as Array<{
    id: string
    name: string
    order_index: number
    zone: StageZone
    is_promotion_gate: boolean
    funnel_step: string | null
  }>
  if (rows.length === 0) return []

  // Playbooks + live candidate counts, in parallel.
  const [{ data: books, error: bookErr }, { data: apps, error: appErr }] = await Promise.all([
    sb.from('stage_playbook').select('*').eq('org_id', orgId).in('stage_id', rows.map(r => r.id)),
    sb.from('applications').select('stage_id').eq('org_id', orgId).eq('job_id', jobId).eq('status', 'active'),
  ])
  if (bookErr) throw bookErr
  if (appErr) throw appErr

  const byStage = new Map<string, StagePlaybook>()
  for (const b of (books ?? []) as StagePlaybook[]) byStage.set(b.stage_id, b)

  // Count active candidacies per stage (Ashby's "Candidates" column).
  const counts = new Map<string, number>()
  for (const a of (apps ?? []) as Array<{ stage_id: string | null }>) {
    if (a.stage_id) counts.set(a.stage_id, (counts.get(a.stage_id) ?? 0) + 1)
  }

  return rows.map(r => ({
    id: r.id,
    name: r.name,
    order_index: r.order_index,
    zone: r.zone,
    is_promotion_gate: r.is_promotion_gate,
    funnel_step: r.funnel_step ?? null,
    candidate_count: counts.get(r.id) ?? 0,
    playbook: byStage.get(r.id) ?? null,
  }))
}

/** Set (or clear) the canonical funnel step a stage maps to (migration 131).
 *  Org-scoped; the caller validates the step id against the canonical list. */
export async function updateStageFunnelStep(
  supabase: Supabase,
  orgId: string,
  stageId: string,
  funnelStep: string | null,
): Promise<void> {
  const sb = supabase as unknown as LooseSb
  const { error } = await sb
    .from('pipeline_stages')
    .update({ funnel_step: funnelStep })
    .eq('org_id', orgId)
    .eq('id', stageId)
  if (error) {
    // Tolerate the column not existing yet (deploy-safe before migration 131):
    // the rest of the plan save still succeeds; funnel_step persists once applied.
    if (error.code === '42703' || /funnel_step/.test(error.message ?? '')) {
      logger.warn('funnel_step column not present yet; skipping mapping write', { stageId })
      return
    }
    throw error
  }
}

// ── Stage playbook ──────────────────────────────────────────────────────────

/** The plain-English playbook for one stage, or null if none saved yet. */
export async function getStagePlaybook(
  supabase: Supabase,
  orgId: string,
  stageId: string,
): Promise<StagePlaybook | null> {
  const sb = supabase as unknown as LooseSb
  const { data, error } = await sb
    .from('stage_playbook')
    .select('*')
    .eq('org_id', orgId)
    .eq('stage_id', stageId)
    .maybeSingle()
  if (error) throw error
  return (data ?? null) as StagePlaybook | null
}

/** Create or update a stage's playbook (one row per stage; UNIQUE(stage_id)). */
export async function upsertStagePlaybook(
  supabase: Supabase,
  orgId: string,
  stageId: string,
  input: StagePlaybookInput,
): Promise<StagePlaybook> {
  const sb = supabase as unknown as LooseSb
  const row = {
    org_id: orgId,
    stage_id: stageId,
    entry_intent: input.entry_intent ?? null,
    advance_criteria: input.advance_criteria ?? null,
    next_stage_id: input.next_stage_id ?? null,
    reject_to: input.reject_to ?? 'archive',
    updated_at: new Date().toISOString(),
  }
  const { data, error } = await sb
    .from('stage_playbook')
    .upsert(row, { onConflict: 'stage_id' })
    .select('*')
    .single()
  if (error) throw error
  return data as StagePlaybook
}

// ── Pipeline automations (rules) ────────────────────────────────────────────

/** All automation rules for a job, ordered oldest-first. */
export async function listJobAutomations(
  supabase: Supabase,
  orgId: string,
  jobId: string,
): Promise<PipelineAutomation[]> {
  const sb = supabase as unknown as LooseSb
  const { data, error } = await sb
    .from('pipeline_automations')
    .select('*')
    .eq('org_id', orgId)
    .eq('job_id', jobId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data ?? []) as PipelineAutomation[]
}

/** Create a rule on a stage. `jobId` is resolved by the caller (from the stage). */
export async function createAutomation(
  supabase: Supabase,
  orgId: string,
  jobId: string,
  input: PipelineAutomationInput,
  createdBy?: string | null,
): Promise<PipelineAutomation> {
  const sb = supabase as unknown as LooseSb
  const { data, error } = await sb
    .from('pipeline_automations')
    .insert({
      org_id: orgId,
      job_id: jobId,
      stage_id: input.stage_id,
      trigger: input.trigger ?? 'stage_entry',
      action_type: input.action_type,
      uses_agent: input.uses_agent ?? false,
      mode: input.mode ?? 'auto',
      config: input.config ?? {},
      guardrails: input.guardrails ?? {},
      enabled: input.enabled ?? true,
      created_by: createdBy ?? null,
    })
    .select('*')
    .single()
  if (error) throw error
  return data as PipelineAutomation
}

/** Partial update of a rule (org-scoped). Returns the updated row or null. */
export async function updateAutomation(
  supabase: Supabase,
  orgId: string,
  id: string,
  patch: Partial<Omit<PipelineAutomation, 'id' | 'org_id' | 'job_id' | 'created_at' | 'created_by'>>,
): Promise<PipelineAutomation | null> {
  const sb = supabase as unknown as LooseSb
  const { data, error } = await sb
    .from('pipeline_automations')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('org_id', orgId)
    .eq('id', id)
    .select('*')
    .maybeSingle()
  if (error) throw error
  return (data ?? null) as PipelineAutomation | null
}

/** Delete a rule (org-scoped). */
export async function deleteAutomation(
  supabase: Supabase,
  orgId: string,
  id: string,
): Promise<void> {
  const sb = supabase as unknown as LooseSb
  const { error } = await sb
    .from('pipeline_automations')
    .delete()
    .eq('org_id', orgId)
    .eq('id', id)
  if (error) throw error
}

// ── Automation runs (audit log) ─────────────────────────────────────────────

/** Recent run records for a candidacy, newest first — the "what the agents did"
 *  history surfaced on the candidate. Read-only in Slice 1a (nothing writes runs
 *  until the agent runtime lands). */
export async function listAutomationRuns(
  supabase: Supabase,
  orgId: string,
  applicationId: string,
  limit = 50,
): Promise<AutomationRun[]> {
  const sb = supabase as unknown as LooseSb
  const { data, error } = await sb
    .from('automation_runs')
    .select('*')
    .eq('org_id', orgId)
    .eq('application_id', applicationId)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return (data ?? []) as AutomationRun[]
}

/** Best-effort logger for an automation run — never throws into the caller, so a
 *  logging failure can't break an action. (Used by the runtime in later slices;
 *  provided now so the write path has one home.) */
export async function recordAutomationRunSafe(
  supabase: Supabase,
  orgId: string,
  run: Omit<AutomationRun, 'id' | 'org_id' | 'created_at'>,
): Promise<void> {
  try {
    const sb = supabase as unknown as LooseSb
    const { error } = await sb.from('automation_runs').insert({ org_id: orgId, ...run })
    if (error) throw error
  } catch (err) {
    logger.error('recordAutomationRunSafe failed', { err, applicationId: run.application_id })
  }
}
