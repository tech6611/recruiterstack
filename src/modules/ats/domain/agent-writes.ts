/**
 * Write facades for AI-assistant (MCP) tools. Each one re-checks that every id belongs
 * to the org, and records a timeline event attributed to the AI app ("actor").
 *
 * Safety rules enforced HERE (not just in the tool), so no caller can skip them:
 *   - stage moves only into the normal hiring zones (application_review / active);
 *     never Offer, Hired or Archived;
 *   - no move into, or add at, a stage with an enabled AUTOMATIC rule (those can email,
 *     call, assess or schedule a candidate) — the recruiter does that in RecruiterStack.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { getFirstLeadStage } from '@/modules/ats/domain/job-pipelines'
import { insertPipelineApplication, listExistingApplicationCandidateIds } from '@/modules/ats/domain/applications'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = any

export const AGENT_MOVABLE_ZONES = new Set(['application_review', 'active'])

/** Enabled AUTOMATIC rules on a stage (suggest/approval-mode rules only record suggestions, so they don't block). */
export async function blockingAutomations(supabase: SupabaseClient, orgId: string, stageId: string): Promise<string[]> {
  const { data, error } = await (supabase as Loose)
    .from('pipeline_automations').select('action_type')
    .eq('org_id', orgId).eq('stage_id', stageId).eq('enabled', true).eq('mode', 'auto')
  if (error) throw error
  return Array.from(new Set(((data ?? []) as Array<{ action_type: string }>).map((r) => r.action_type)))
}

const AUTOMATION_WORDS: Record<string, string> = {
  enrol_outreach: 'enrols them in an email sequence', ai_call: 'places an AI phone call', screen: 'starts an AI screen',
  send_email: 'sends an email', send_assessment: 'sends an assessment', schedule_interview: 'books an interview',
  request_availability: 'asks for their availability', create_offer: 'creates an offer', archive: 'archives them',
  move_stage: 'moves them to another stage', handoff_to_hm: 'hands them to the hiring manager', promote_lead: 'promotes them out of the lead funnel',
}
export function describeAutomations(actions: string[]): string {
  return actions.map((a) => AUTOMATION_WORDS[a] ?? a).join(', ')
}

export type AgentActor = { label: string } // e.g. "AI assistant (Claude)"

// ── Add to job ────────────────────────────────────────────────────────────────

export type AddResult = {
  stage: string | null
  added: Array<{ candidate_id: string; application_id: string }>
  already_on_job: string[]
  not_found: string[]
  blocked_by_automation?: string
}

/** Add org candidates to a job's entry ("New lead") stage. Skips duplicates; refuses unknown ids. */
export async function addCandidatesToJobForAgent(
  supabase: SupabaseClient,
  orgId: string,
  jobId: string,
  candidateIds: string[],
  actor: AgentActor,
): Promise<AddResult> {
  const sb = supabase as Loose
  const unique = Array.from(new Set(candidateIds))
  const { data: owned, error } = await sb.from('candidates').select('id').eq('org_id', orgId).in('id', unique)
  if (error) throw error
  const ownedIds = new Set(((owned ?? []) as Array<{ id: string }>).map((c) => c.id))
  const notFound = unique.filter((id) => !ownedIds.has(id))

  const { stage, lifecycle } = await getFirstLeadStage(supabase as never, orgId, jobId)
  if (stage?.id) {
    const blocking = await blockingAutomations(supabase, orgId, stage.id)
    if (blocking.length) {
      return { stage: stage.name, added: [], already_on_job: [], not_found: notFound, blocked_by_automation: describeAutomations(blocking) }
    }
  }

  const candidates = unique.filter((id) => ownedIds.has(id))
  const existing = await listExistingApplicationCandidateIds(supabase as never, orgId, jobId, candidates)
  const existingIds = new Set(((existing ?? []) as Array<{ candidate_id: string }>).map((e) => e.candidate_id))
  const added: AddResult['added'] = []
  for (const candidateId of candidates.filter((id) => !existingIds.has(id))) {
    const { data: app, error: insErr } = await insertPipelineApplication(supabase as never, orgId, {
      candidateId, jobId, stageId: stage?.id ?? null, source: 'sourced', lifecycle,
    })
    if (insErr || !app) continue
    await sb.from('application_events').insert({
      application_id: (app as { id: string }).id, event_type: 'sourced', org_id: orgId,
      note: `Added to this job by ${actor.label}`, created_by: actor.label,
    })
    added.push({ candidate_id: candidateId, application_id: (app as { id: string }).id })
  }
  return { stage: stage?.name ?? null, added, already_on_job: candidates.filter((id) => existingIds.has(id)), not_found: notFound }
}

// ── Move stage ────────────────────────────────────────────────────────────────

export type MoveOutcome =
  | { ok: true; application_id: string; candidate: string; from: string; to: string }
  | { ok: false; application_id: string; reason: string }

/** Resolve a target stage on a job by name, enforcing the agent-movable zones and automation rule. */
export async function resolveAgentTargetStage(
  supabase: SupabaseClient,
  orgId: string,
  jobId: string,
  stageName: string,
): Promise<{ ok: true; stage: { id: string; name: string; zone: string | null } } | { ok: false; reason: string }> {
  const { data, error } = await (supabase as Loose)
    .from('pipeline_stages').select('id, name, zone, order_index').eq('org_id', orgId).eq('job_id', jobId).order('order_index')
  if (error) throw error
  const stages = (data ?? []) as Array<{ id: string; name: string; zone: string | null }>
  const allowed = stages.filter((s) => AGENT_MOVABLE_ZONES.has(s.zone ?? ''))
  const match = stages.find((s) => s.name.trim().toLowerCase() === stageName.trim().toLowerCase())
  if (!match) return { ok: false, reason: `This job has no stage called "${stageName}". AI assistants can move people to: ${allowed.map((s) => s.name).join(', ')}.` }
  if (!AGENT_MOVABLE_ZONES.has(match.zone ?? '')) {
    return { ok: false, reason: `Moving people to "${match.name}" is a hiring decision, so it's only done in RecruiterStack. AI assistants can move people to: ${allowed.map((s) => s.name).join(', ')}.` }
  }
  const blocking = await blockingAutomations(supabase, orgId, match.id)
  if (blocking.length) {
    return { ok: false, reason: `"${match.name}" has an automatic rule that ${describeAutomations(blocking)}. To avoid contacting candidates by surprise, make this move in RecruiterStack.` }
  }
  return { ok: true, stage: match }
}

/** Move one application (must be on `jobId`, in the org, active) to an already-validated stage. */
export async function moveApplicationForAgent(
  supabase: SupabaseClient,
  orgId: string,
  jobId: string,
  applicationId: string,
  stage: { id: string; name: string; zone: string | null },
  reason: string | null,
  actor: AgentActor,
): Promise<MoveOutcome> {
  const sb = supabase as Loose
  const { data: app, error } = await sb
    .from('applications').select('id, job_id, status, lifecycle, stage_id, stage:pipeline_stages(name), candidate:candidates(name)')
    .eq('id', applicationId).eq('org_id', orgId).maybeSingle()
  if (error) throw error
  if (!app || app.job_id !== jobId) return { ok: false, application_id: applicationId, reason: 'Not found on this job.' }
  if (app.status !== 'active') return { ok: false, application_id: applicationId, reason: `Not active (status: ${app.status}).` }
  if (app.stage_id === stage.id) return { ok: false, application_id: applicationId, reason: `Already in "${stage.name}".` }
  const promote = app.lifecycle === 'lead' && stage.zone && stage.zone !== 'lead'
  const { error: updErr } = await sb.from('applications')
    .update({ stage_id: stage.id, ...(promote ? { lifecycle: 'active' } : {}) })
    .eq('id', applicationId).eq('org_id', orgId)
  if (updErr) throw updErr
  const from = app.stage?.name ?? 'unknown'
  await sb.from('application_events').insert({
    application_id: applicationId, event_type: 'stage_moved', from_stage: from, to_stage: stage.name, org_id: orgId,
    note: reason ? `${reason} (moved by ${actor.label})` : `Moved by ${actor.label}`, created_by: actor.label,
  })
  return { ok: true, application_id: applicationId, candidate: app.candidate?.name ?? 'Candidate', from, to: stage.name }
}

// ── Notes ─────────────────────────────────────────────────────────────────────

/** Add a note to an application in the org. Returns null if the application isn't in the org. */
export async function addNoteForAgent(
  supabase: SupabaseClient,
  orgId: string,
  applicationId: string,
  text: string,
  actor: AgentActor,
): Promise<{ application_id: string; candidate: string | null; job: string | null } | null> {
  const sb = supabase as Loose
  const { data: app, error } = await sb
    .from('applications').select('id, candidate:candidates(name), job:jobs(title)').eq('id', applicationId).eq('org_id', orgId).maybeSingle()
  if (error) throw error
  if (!app) return null
  const { error: insErr } = await sb.from('application_events').insert({
    application_id: applicationId, event_type: 'note_added', note: `${text}\n\n— added by ${actor.label}`, created_by: actor.label, org_id: orgId,
  })
  if (insErr) throw insErr
  return { application_id: applicationId, candidate: app.candidate?.name ?? null, job: app.job?.title ?? null }
}

// ── Sourcing spend ────────────────────────────────────────────────────────────

/**
 * Vendor credits this org spent on sourcing since `sinceIso` (all paths — app and AI assistants).
 * Uses the EXACT fractional spend stored per search step (query.results[].creditsUsed, from the
 * vendor's x-credits-used header). The integer credits_used column is rounded UP (0.03 → 1), so
 * it is only a fallback for runs without per-step detail.
 */
export async function sourcingCreditsSince(supabase: SupabaseClient, orgId: string, sinceIso: string): Promise<number> {
  const { data, error } = await (supabase as Loose)
    .from('pool_ingest_runs').select('credits_used, query').eq('org_id', orgId).gte('started_at', sinceIso)
  if (error) throw error
  let total = 0
  for (const r of (data ?? []) as Array<{ credits_used: number | null; query: { results?: Array<{ creditsUsed?: number }> } | null }>) {
    const steps = r.query?.results
    total += Array.isArray(steps) && steps.length
      ? steps.reduce((n, st) => n + Number(st.creditsUsed ?? 0), 0)
      : Number(r.credits_used ?? 0)
  }
  return Math.round(total * 1000) / 1000
}
