import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/server'
import { getJobForAgent } from '@/modules/ats/domain/agent-reads'
import {
  addCandidatesToJobForAgent,
  resolveAgentTargetStage,
  moveApplicationForAgent,
  addNoteForAgent,
  sourcingCreditsSince,
  type AgentActor,
} from '@/modules/ats/domain/agent-writes'
import { getCurrentIcp } from '@/modules/ats/domain/icp'
import { guarded, type ToolResult } from '../tool'
import type { McpContext } from '../guard'
import { jobVisibility, appUrl } from '../visibility'
import { findNewCandidates, unlockProfiles } from '../sourcing'

/**
 * Tools with consequences (doc section 3). All:
 *   - write-annotated, so ChatGPT / Claude ask the user before running them;
 *   - re-check every id against the workspace (domain layer: agent-writes.ts);
 *   - need a RecruiterStack role that can edit (recruiting:edit);
 *   - record "AI assistant (ChatGPT/Claude)" on the candidate timeline + the audit log;
 *   - max 25 people per call.
 * None of them can contact a candidate, reject, offer or hire.
 */

const WRITE = { readOnlyHint: false, destructiveHint: false, openWorldHint: false } as const
const NOT_FOUND = 'No job with that ID was found in this RecruiterStack workspace. Use search_jobs to find the right job_id.'
export const DAILY_SOURCING_CREDITS = Number(process.env.MCP_DAILY_SOURCING_CREDITS ?? 2)
const CREDITS_PER_PERSON = 0.03 // Crustdata, measured 2026-09

function out(data: Record<string, unknown>, resultCount: number): ToolResult & { resultCount: number } {
  return { structuredContent: data, content: [{ type: 'text', text: JSON.stringify(data) }], resultCount }
}
const err = (text: string): ToolResult & { resultCount: number } => ({ isError: true, content: [{ type: 'text', text }], resultCount: 0 })

export function actorFor(ctx: McpContext): AgentActor {
  const id = ctx.caller.clientId
  const app = id.startsWith('https://chatgpt.com/') ? 'ChatGPT' : id.startsWith('https://claude.ai/') ? 'Claude' : null
  return { label: app ? `AI assistant (${app})` : 'AI assistant' }
}

async function visibleJob(ctx: McpContext, jobId: string) {
  const job = await getJobForAgent(ctx.supabase, ctx.orgId, jobId)
  if (!job) return null
  return (await jobVisibility(ctx))(job) ? job : null
}

// ── add_candidates_to_job ─────────────────────────────────────────────────────

export const addInput = z.object({
  job_id: z.string().uuid(),
  candidate_ids: z.array(z.string().uuid()).max(25).optional().describe('Candidates already in RecruiterStack (candidate_id).'),
  profile_ids: z.array(z.string().uuid()).max(25).optional().describe('New people from find_new_candidates_for_job (profile_id).'),
})

export const addCandidatesToJob = guarded('add_candidates_to_job', { scope: 'pipeline:write', capability: 'recruiting:edit' },
  async (args: z.infer<typeof addInput>, ctx) => {
    const total = (args.candidate_ids?.length ?? 0) + (args.profile_ids?.length ?? 0)
    if (total === 0) return err('Give candidate_ids and/or profile_ids.')
    if (total > 25) return err('At most 25 people per call.')
    const job = await visibleJob(ctx, args.job_id)
    if (!job) return err(NOT_FOUND)

    let fromProfiles: string[] = []
    let unlockNotes: Array<{ profile_id: string; status: string }> = []
    let quotaExceeded = false
    if (args.profile_ids?.length) {
      const u = await unlockProfiles(ctx.supabase, ctx.orgId, ctx.userId, args.profile_ids)
      quotaExceeded = u.quotaExceeded
      fromProfiles = u.outcomes.filter((o) => o.candidate_id).map((o) => o.candidate_id!)
      unlockNotes = u.outcomes.filter((o) => !o.candidate_id).map((o) => ({ profile_id: o.profile_id, status: o.status }))
    }
    const r = await addCandidatesToJobForAgent(ctx.supabase, ctx.orgId, job.id, [...(args.candidate_ids ?? []), ...fromProfiles], actorFor(ctx))
    if (r.blocked_by_automation) {
      return err(`Not added: this job's "${r.stage}" stage has an automatic rule that ${r.blocked_by_automation}. To avoid contacting candidates by surprise, add them in RecruiterStack.`)
    }
    return out({
      job_id: job.id, job_title: job.title, stage: r.stage,
      added: r.added.length, added_candidate_ids: r.added.map((a) => a.candidate_id),
      already_on_job: r.already_on_job, not_found: r.not_found,
      profiles_not_added: unlockNotes, unlock_quota_reached: quotaExceeded,
      note: 'Added only — nobody was contacted.', url: appUrl(`/req-jobs/${job.id}`),
    }, r.added.length)
  })

// ── move_candidates_stage ─────────────────────────────────────────────────────

export const moveInput = z.object({
  job_id: z.string().uuid(),
  application_ids: z.array(z.string().uuid()).min(1).max(25).describe('application_id values from get_pipeline or rank_candidates_for_job.'),
  to_stage: z.string().min(1).max(60).describe('Stage name, e.g. "Screening", "Phone Screen", "Interview".'),
  reason: z.string().max(500).optional(),
})

export const moveCandidatesStage = guarded('move_candidates_stage', { scope: 'pipeline:write', capability: 'recruiting:edit' },
  async (args: z.infer<typeof moveInput>, ctx) => {
    const job = await visibleJob(ctx, args.job_id)
    if (!job) return err(NOT_FOUND)
    const target = await resolveAgentTargetStage(ctx.supabase, ctx.orgId, job.id, args.to_stage)
    if (!target.ok) return err(target.reason)
    const actor = actorFor(ctx)
    const results = []
    for (const id of Array.from(new Set(args.application_ids))) {
      results.push(await moveApplicationForAgent(ctx.supabase, ctx.orgId, job.id, id, target.stage, args.reason ?? null, actor))
    }
    const moved = results.filter((r) => r.ok)
    return out({
      job_id: job.id, to_stage: target.stage.name,
      moved: moved.map((r) => (r.ok ? { application_id: r.application_id, candidate: r.candidate, from: r.from } : null)),
      not_moved: results.filter((r) => !r.ok).map((r) => (!r.ok ? { application_id: r.application_id, reason: r.reason } : null)),
      note: 'Stage changed only — nobody was contacted.', url: appUrl(`/req-jobs/${job.id}`),
    }, moved.length)
  })

// ── add_note ──────────────────────────────────────────────────────────────────

export const noteInput = z.object({
  application_id: z.string().uuid().describe('The application_id (a candidate on a specific job).'),
  text: z.string().min(1).max(4000),
})

export const addNote = guarded('add_note', { scope: 'notes:write', capability: 'recruiting:edit' },
  async (args: z.infer<typeof noteInput>, ctx) => {
    const r = await addNoteForAgent(ctx.supabase, ctx.orgId, args.application_id, args.text.trim(), actorFor(ctx))
    if (!r) return err('No application with that ID was found in this RecruiterStack workspace.')
    return out({ ...r, saved: true, note: `Saved to the candidate's timeline, labelled "${actorFor(ctx).label}".` }, 1)
  })

// ── find_new_candidates_for_job ───────────────────────────────────────────────

export const findInput = z.object({
  job_id: z.string().uuid(),
  count: z.number().int().min(1).max(25).default(5).describe('How many new people to fetch (each costs ~0.03 sourcing credits).'),
})

export const findNewCandidatesForJob = guarded('find_new_candidates_for_job', { scope: 'sourcing:run', capability: 'recruiting:edit' },
  async (args: z.infer<typeof findInput>, ctx) => {
    const job = await visibleJob(ctx, args.job_id)
    if (!job) return err(NOT_FOUND)
    const icp = await getCurrentIcp(ctx.supabase as never, ctx.orgId, job.id)
    if (!icp || icp.status !== 'approved') return err('This job needs an approved ideal candidate profile before sourcing. Approve one in RecruiterStack first.')

    const startOfDay = new Date(); startOfDay.setUTCHours(0, 0, 0, 0)
    const used = await sourcingCreditsSince(ctx.supabase, ctx.orgId, startOfDay.toISOString())
    const left = Math.max(0, DAILY_SOURCING_CREDITS - used)
    const affordable = Math.floor(left / CREDITS_PER_PERSON + 1e-9)
    if (affordable < 1) {
      return err(`This workspace has used today's sourcing allowance (${DAILY_SOURCING_CREDITS} credits; ${used.toFixed(2)} used). It resets at midnight UTC.`)
    }
    const count = Math.min(args.count, affordable)

    const r = await findNewCandidates(ctx.supabase, ctx.orgId, ctx.userId, { id: job.id, title: job.title }, icp, count)
    if (!r.ok) return err(r.reason)
    const proposals = r.matches.sort((a, b) => b.score - a.score).map((m) => ({
      profile_id: m.profile_id,
      name: m.name,
      headline: [m.current_title, m.current_company].filter(Boolean).join(' at ') || null,
      location: m.location,
      experience_years: m.experience_years,
      ai_score: m.score,
      fit: m.fit_bucket,
      why: m.rationale?.slice(0, 300) ?? null,
      missed_must_haves: m.gate_failures,
      reachable: m.reachable,
    }))
    return out({
      job_id: job.id, job_title: job.title,
      proposals,
      fetched: r.fetched,
      requested: args.count,
      ...(count < args.count ? { reduced_to: count, reduced_because: 'daily sourcing allowance' } : {}),
      credits_used: Math.round(r.creditsUsed * 1000) / 1000,
      credits_left_today: Math.max(0, Math.round((left - r.creditsUsed) * 1000) / 1000),
      requirements_not_searchable: r.unmapped,
      next_step: 'These are proposals only — nobody has been added. To shortlist, call add_candidates_to_job with their profile_id values.',
      note: 'AI suggestions to support the recruiter. A person reviews and makes every hiring decision.',
    }, proposals.length)
  })

export function registerActionTools(server: McpServer) {
  server.registerTool('add_candidates_to_job', {
    title: 'Add candidates to a job',
    description:
      "Shortlist people onto a job's pipeline (its first \"New lead\" stage). Accepts existing candidates (candidate_ids) and/or " +
      'new people from find_new_candidates_for_job (profile_ids). Skips anyone already on the job. Does not contact anyone. ' +
      'Confirm with the user first.',
    inputSchema: addInput,
    annotations: { ...WRITE, idempotentHint: true },
  }, addCandidatesToJob)

  server.registerTool('move_candidates_stage', {
    title: 'Move candidates to a stage',
    description:
      'Move candidates (application_ids) on one job to another hiring stage by name — e.g. Screening, Phone Screen, Interview. ' +
      'Cannot move to Offer, Hired or Archived, or to a stage with automatic actions; those are done in RecruiterStack. ' +
      'Does not contact anyone. Confirm with the user first.',
    inputSchema: moveInput,
    annotations: { ...WRITE, idempotentHint: true },
  }, moveCandidatesStage)

  server.registerTool('add_note', {
    title: 'Add a note',
    description: "Add a recruiter note to a candidate's application timeline, labelled as added by the AI assistant.",
    inputSchema: noteInput,
    annotations: { ...WRITE, idempotentHint: false },
  }, addNote)

  server.registerTool('find_new_candidates_for_job', {
    title: 'Find new candidates (market search)',
    description:
      "Search the external market (Crustdata) for NEW people matching a job's approved ideal profile, then AI-score them. " +
      'Spends sourcing credits (~0.03 per person; daily cap per workspace) and reports credits used. Returns proposals only — ' +
      'nobody is added until add_candidates_to_job. Confirm with the user first.',
    inputSchema: findInput,
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  }, findNewCandidatesForJob)
}
