import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/server'
import {
  getJobForAgent,
  listFitForAgent,
  listStagesForAgent,
  countMcpScoredSince,
  averageFitScoringCostUsd,
  type AgentFitRow,
} from '@/modules/ats/domain/agent-reads'
import { getCurrentIcp } from '@/modules/ats/domain/icp'
import { scoreOneApplication } from '@/lib/ai/score-application'
import { guarded, type ToolResult } from '../tool'
import type { McpContext } from '../guard'
import { jobVisibility, appUrl } from '../visibility'

/**
 * Ranking tools.
 *   rank_candidates_for_job  — read-only, free: ranks by scores RecruiterStack already has.
 *   score_candidates_for_job — WRITES AI scores and spends AI credits (~$0.0014 per
 *                              candidate, measured). Only scores UNSCORED candidates —
 *                              never overwrites an existing score — so it is not destructive.
 *                              Daily cap per workspace. Hosts ask the user to confirm.
 *
 * Hiring is a high-risk use under both OpenAI's and Anthropic's policies: every result
 * is framed as an AI suggestion; a person makes every decision. Nothing here advances
 * or rejects anyone.
 */

const NOT_FOUND = 'No job with that ID was found in this RecruiterStack workspace. Use search_jobs to find the right job_id.'
const HUMAN_DECIDES = 'AI suggestions to support the recruiter. A person reviews and makes every hiring decision.'
export const DAILY_SCORING_CAP = Number(process.env.MCP_DAILY_SCORING_CAP ?? 200)
const SCORING_CONCURRENCY = 5

function result(data: Record<string, unknown>, resultCount: number): ToolResult & { resultCount: number } {
  return { structuredContent: data, content: [{ type: 'text', text: JSON.stringify(data) }], resultCount }
}
const err = (text: string): ToolResult & { resultCount: number } => ({ isError: true, content: [{ type: 'text', text }], resultCount: 0 })

async function visibleJob(ctx: McpContext, jobId: string) {
  const job = await getJobForAgent(ctx.supabase, ctx.orgId, jobId)
  if (!job) return null
  return (await jobVisibility(ctx))(job) ? job : null
}

const gateLabel = (g: { label?: string } | string) => (typeof g === 'string' ? g : g.label ?? 'must-have')
const firstN = (xs: string[], n = 3) => xs.slice(0, n)

export const rankInput = z.object({
  job_id: z.string().uuid().describe('The job_id from search_jobs.'),
  candidate_ids: z.array(z.string().uuid()).max(25).optional()
    .describe('Optional: only rank/compare these candidates (candidate_id values) within the job.'),
  limit: z.number().int().min(1).max(25).default(10),
})

export const scoreInput = z.object({
  job_id: z.string().uuid().describe('The job_id from search_jobs.'),
  candidate_ids: z.array(z.string().uuid()).max(25).optional()
    .describe('Optional: only score these candidates. Default: the job\'s unscored candidates, up to max_candidates.'),
  max_candidates: z.number().int().min(1).max(25).default(25),
})

export const rankCandidates = guarded('rank_candidates_for_job', { scope: 'candidates:read', capability: 'recruiting:view' },
  async (args: z.infer<typeof rankInput>, ctx) => {
    const job = await visibleJob(ctx, args.job_id)
    if (!job) return err(NOT_FOUND)
    const [rows, stages, icp] = await Promise.all([
      listFitForAgent(ctx.supabase, ctx.orgId, job.id),
      listStagesForAgent(ctx.supabase, ctx.orgId, job.id),
      getCurrentIcp(ctx.supabase as never, ctx.orgId, job.id),
    ])
    const stageName = new Map(stages.map((s) => [s.id, s.name]))
    const pool = args.candidate_ids ? rows.filter((r) => args.candidate_ids!.includes(r.candidate_id)) : rows
    const scored = pool.filter((r) => r.ai_score != null).sort((a, b) => (b.ai_score ?? 0) - (a.ai_score ?? 0))
    const unscored = pool.filter((r) => r.ai_score == null)
    const currentVersion = icp?.status === 'approved' ? icp.version : null
    const card = (r: AgentFitRow, i: number) => ({
      rank: i + 1,
      application_id: r.application_id,
      candidate_id: r.candidate_id,
      name: r.name,
      headline: [r.current_title, r.current_company].filter(Boolean).join(' at ') || null,
      stage: stageName.get(r.stage_id ?? '') ?? null,
      ai_score: r.ai_score,
      fit: r.fit_bucket,
      recommendation: r.recommendation,
      missed_must_haves: r.gate_failures.map(gateLabel),
      strengths: firstN(r.strengths),
      gaps: firstN(r.gaps),
      red_flags: firstN(r.red_flags),
      competency_ratings: (r.criterion_scores ?? []).map((c) => ({ competency: c.name ?? null, rating_1_to_4: c.rating ?? null })),
      score_is_out_of_date: currentVersion != null && r.icp_version != null && r.icp_version !== currentVersion,
    })
    const top = scored.slice(0, args.limit)
    const data = {
      job_id: job.id,
      job_title: job.title,
      ranked: top.map(card),
      not_yet_scored: unscored.map((r) => ({ candidate_id: r.candidate_id, name: r.name })),
      not_in_this_job: args.candidate_ids ? args.candidate_ids.filter((id) => !rows.some((r) => r.candidate_id === id)) : [],
      next_step: unscored.length
        ? `${unscored.length} candidate(s) have no AI score yet. score_candidates_for_job can score them (small AI cost; needs the user's OK).`
        : null,
      note: HUMAN_DECIDES,
      url: appUrl(`/req-jobs/${job.id}`),
    }
    return result(data, top.length)
  })

export const scoreCandidates = guarded('score_candidates_for_job', { scope: 'pipeline:write', capability: 'recruiting:edit' },
  async (args: z.infer<typeof scoreInput>, ctx) => {
    if (!process.env.GEMINI_API_KEY) return err('AI scoring is not configured on this RecruiterStack server.')
    const job = await visibleJob(ctx, args.job_id)
    if (!job) return err(NOT_FOUND)
    const rows = await listFitForAgent(ctx.supabase, ctx.orgId, job.id)
    const pool = args.candidate_ids ? rows.filter((r) => args.candidate_ids!.includes(r.candidate_id)) : rows
    const alreadyScored = pool.filter((r) => r.ai_score != null).length
    const todo = pool.filter((r) => r.ai_score == null).slice(0, args.max_candidates)
    if (!todo.length) {
      return result({ job_id: job.id, scored: [], already_scored: alreadyScored, estimated_cost_usd: 0,
        message: 'Nothing to score: every selected candidate already has a score. Re-scoring is done in RecruiterStack.' }, 0)
    }

    // Daily safety cap per workspace (counted from the AI activity log).
    const startOfDay = new Date(); startOfDay.setUTCHours(0, 0, 0, 0)
    const usedToday = await countMcpScoredSince(ctx.supabase, ctx.orgId, startOfDay.toISOString())
    const remaining = Math.max(0, DAILY_SCORING_CAP - usedToday)
    if (remaining === 0) {
      return err(`This workspace has reached today's limit of ${DAILY_SCORING_CAP} candidates scored through AI assistants. It resets at midnight UTC, or score in RecruiterStack directly.`)
    }
    const batch = todo.slice(0, remaining)

    const outcomes: Array<{ row: AgentFitRow; ok: boolean; score?: unknown; fit?: unknown }> = []
    for (let i = 0; i < batch.length; i += SCORING_CONCURRENCY) {
      const chunk = batch.slice(i, i + SCORING_CONCURRENCY)
      const done = await Promise.all(chunk.map(async (row) => {
        try {
          const r = await scoreOneApplication(ctx.supabase as never, ctx.orgId, row.application_id, ctx.userId)
          return r.ok ? { row, ok: true, score: r.score, fit: r.extra.fit_bucket ?? null } : { row, ok: false }
        } catch (e) {
          console.error('[mcp] score_candidates_for_job: one candidate failed', e)
          return { row, ok: false }
        }
      }))
      outcomes.push(...done)
    }
    const ok = outcomes.filter((o) => o.ok)
    const perCandidate = await averageFitScoringCostUsd(ctx.supabase, ctx.orgId)
    const data = {
      job_id: job.id,
      job_title: job.title,
      scored: ok.map((o) => ({ candidate_id: o.row.candidate_id, name: o.row.name, ai_score: o.score, fit: o.fit })),
      failed: outcomes.filter((o) => !o.ok).map((o) => ({ candidate_id: o.row.candidate_id, name: o.row.name })),
      already_scored: alreadyScored,
      left_unscored_due_to_limits: todo.length - batch.length + (pool.filter((r) => r.ai_score == null).length - todo.length),
      estimated_cost_usd: Math.round(ok.length * perCandidate * 10000) / 10000,
      daily_limit_remaining: Math.max(0, remaining - ok.length),
      next_step: 'Use rank_candidates_for_job to see the ranking with reasons.',
      note: HUMAN_DECIDES,
    }
    return result(data, ok.length)
  })

export function registerRankingTools(server: McpServer) {
  server.registerTool('rank_candidates_for_job', {
    title: 'Rank candidates for a job',
    description:
      "Rank a job's candidates by RecruiterStack's AI fit score against the job's ideal profile, with strengths, gaps, " +
      'missed must-haves and per-competency ratings. Pass candidate_ids to compare specific people. Free and read-only; ' +
      'lists candidates not yet scored. Results are suggestions — a person makes every hiring decision.',
    inputSchema: rankInput,
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  }, rankCandidates)

  server.registerTool('score_candidates_for_job', {
    title: 'Score unscored candidates (AI)',
    description:
      "Run RecruiterStack's AI fit scoring on a job's candidates who have NO score yet (max 25 per call) and save the " +
      'scores. Uses a small amount of AI credit (about $0.0015 per candidate) and reports the cost. Never overwrites ' +
      'existing scores and never moves or rejects anyone. Ask the user before using it.',
    inputSchema: scoreInput,
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, scoreCandidates)
}
