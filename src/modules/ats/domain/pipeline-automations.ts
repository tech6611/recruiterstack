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

// ── Canonical stage CRUD (job_id-based) ─────────────────────────────────────
// The legacy /api/jobs/[id]/stages route is hiring_request_id-based and doesn't
// touch canonical jobs, so the plan editor manages canonical stages here.

/** Stages that can't be renamed or removed — the fixed lead ladder and the
 *  terminal outcomes (Ashby locks these too). */
export function isLockedStage(zone: string | null, name: string): boolean {
  return zone === 'lead' || ['Hired', 'Rejected', 'Archived'].includes(name.trim())
}

/** Create a stage on a canonical job in a given zone. order_index is a temporary
 *  end value; callers normally follow with reorderStages to place it precisely. */
export async function createStage(
  supabase: Supabase,
  orgId: string,
  jobId: string,
  input: { name: string; zone: StageZone; color?: string },
): Promise<{ id: string; name: string; order_index: number; zone: StageZone; is_promotion_gate: boolean; funnel_step: string | null }> {
  const sb = supabase as unknown as LooseSb
  const { data: max } = await sb
    .from('pipeline_stages')
    .select('order_index')
    .eq('org_id', orgId).eq('job_id', jobId)
    .order('order_index', { ascending: false }).limit(1).maybeSingle()
  const nextIndex = (max?.order_index ?? -1) + 1
  // Don't select funnel_step back — it may not exist yet (migration 131) and the
  // caller reloads via getZonedStages anyway (which is resilient to that).
  const { data, error } = await sb
    .from('pipeline_stages')
    .insert({ org_id: orgId, job_id: jobId, name: input.name, color: input.color ?? 'slate', zone: input.zone, order_index: nextIndex })
    .select('id, name, order_index, zone, is_promotion_gate')
    .single()
  if (error) throw error
  return { ...data, funnel_step: null }
}

/** Rename a stage (org+job scoped). Throws 'STAGE_LOCKED' for fixed stages. */
export async function renameStage(
  supabase: Supabase,
  orgId: string,
  jobId: string,
  stageId: string,
  name: string,
): Promise<void> {
  const sb = supabase as unknown as LooseSb
  const { data: stage } = await sb
    .from('pipeline_stages')
    .select('zone, name').eq('org_id', orgId).eq('job_id', jobId).eq('id', stageId).maybeSingle()
  if (!stage) throw new Error('STAGE_NOT_FOUND')
  if (isLockedStage(stage.zone, stage.name)) throw new Error('STAGE_LOCKED')
  const { error } = await sb
    .from('pipeline_stages').update({ name }).eq('org_id', orgId).eq('job_id', jobId).eq('id', stageId)
  if (error) throw error
}

/** Delete a stage (org+job scoped), detaching any applications first. Throws
 *  'STAGE_LOCKED' for fixed stages. */
export async function deleteStage(
  supabase: Supabase,
  orgId: string,
  jobId: string,
  stageId: string,
): Promise<void> {
  const sb = supabase as unknown as LooseSb
  const { data: stage } = await sb
    .from('pipeline_stages')
    .select('zone, name').eq('org_id', orgId).eq('job_id', jobId).eq('id', stageId).maybeSingle()
  if (!stage) throw new Error('STAGE_NOT_FOUND')
  if (isLockedStage(stage.zone, stage.name)) throw new Error('STAGE_LOCKED')
  await sb.from('applications').update({ stage_id: null }).eq('org_id', orgId).eq('job_id', jobId).eq('stage_id', stageId)
  const { error } = await sb.from('pipeline_stages').delete().eq('org_id', orgId).eq('job_id', jobId).eq('id', stageId)
  if (error) throw error
}

/** Bulk-set order_index for a job's stages (org+job scoped). */
export async function reorderStages(
  supabase: Supabase,
  orgId: string,
  jobId: string,
  order: { id: string; order_index: number }[],
): Promise<void> {
  const sb = supabase as unknown as LooseSb
  await Promise.all(order.map(o =>
    sb.from('pipeline_stages').update({ order_index: o.order_index })
      .eq('org_id', orgId).eq('job_id', jobId).eq('id', o.id),
  ))
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

/** Recent automation runs across a whole job (for the activity panel), enriched
 *  with the candidate's name. Reads runs for the job's rules, newest first. */
export async function listJobAutomationRuns(
  supabase: Supabase,
  orgId: string,
  jobId: string,
  limit = 50,
): Promise<import('@/lib/types/pipeline-automations').AutomationRunView[]> {
  const sb = supabase as unknown as LooseSb
  const { data: rules } = await sb
    .from('pipeline_automations').select('id').eq('org_id', orgId).eq('job_id', jobId)
  const ruleIds = ((rules ?? []) as Array<{ id: string }>).map(r => r.id)
  if (!ruleIds.length) return []

  const { data: runs, error } = await sb
    .from('automation_runs').select('*')
    .eq('org_id', orgId).in('automation_id', ruleIds)
    .order('created_at', { ascending: false }).limit(limit)
  if (error) throw error
  const list = (runs ?? []) as AutomationRun[]
  if (!list.length) return []

  // Enrich with candidate names (identity lives on people; fall back to candidates).
  const appIds = Array.from(new Set(list.map(r => r.application_id)))
  const names = new Map<string, string>()
  const { data: apps } = await sb
    .from('applications').select('id, candidate:candidates(name, person:people(name))').in('id', appIds)
  for (const a of (apps ?? []) as Array<{ id: string; candidate?: { name?: string | null; person?: { name?: string | null } | null } | null }>) {
    const nm = a.candidate?.person?.name ?? a.candidate?.name ?? null
    if (nm) names.set(a.id, nm)
  }
  return list.map(r => ({ ...r, candidate_name: names.get(r.application_id) ?? null }))
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
