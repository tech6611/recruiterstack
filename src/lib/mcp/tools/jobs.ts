import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/server'
import {
  listJobsForAgent,
  getJobForAgent,
  countActiveApplicationsByJob,
  listStagesForAgent,
  listPipelineForAgent,
  type AgentJobRow,
} from '@/modules/ats/domain/agent-reads'
import { getCurrentIcp } from '@/modules/ats/domain/icp'
import { guarded, type ToolResult } from '../tool'
import type { McpContext } from '../guard'
import { jobVisibility, appUrl } from '../visibility'

/**
 * Read-only job tools: search_jobs, get_job, get_pipeline.
 * All three: scope jobs:read, capability recruiting:view (limited viewers see only
 * their jobs), no contact details, results capped. Annotations are explicit for
 * both directories (OpenAI requires all three hints; Anthropic requires title + hint).
 */

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, openWorldHint: false } as const
const READ_JOBS = { scope: 'jobs:read', capability: 'recruiting:view' } as const
const READ_PIPELINE = { scope: 'candidates:read', capability: 'recruiting:view' } as const

const NOT_FOUND = 'No job with that ID was found in this RecruiterStack workspace. Use search_jobs to find the right job_id.'
const DESCRIPTION_LIMIT = 1500
const DAY_MS = 86_400_000

function result(data: Record<string, unknown>, resultCount: number): ToolResult & { resultCount: number } {
  return { structuredContent: data, content: [{ type: 'text', text: JSON.stringify(data) }], resultCount }
}

function notFound(): ToolResult & { resultCount: number } {
  return { isError: true, content: [{ type: 'text', text: NOT_FOUND }], resultCount: 0 }
}

/** Load a job only if the caller may see it (else null → "not found"). */
async function visibleJob(ctx: McpContext, jobId: string): Promise<AgentJobRow | null> {
  const job = await getJobForAgent(ctx.supabase, ctx.orgId, jobId)
  if (!job) return null
  const canSee = await jobVisibility(ctx)
  return canSee(job) ? job : null
}

function compensation(ctx: McpContext, job: AgentJobRow) {
  // Pay ranges only for workspace admins/owners — same sensitivity as in the app.
  if (!(ctx.viewer.isAdmin || ctx.viewer.isOwner)) return undefined
  if (job.comp_min == null && job.comp_max == null) return undefined
  return { min: job.comp_min, max: job.comp_max, currency: job.comp_currency }
}

export const searchJobsInput = z.object({
  query: z.string().max(100).optional().describe('Words from the job title, e.g. "backend" or "designer". Leave empty to list jobs.'),
  status: z.enum(['active', 'open', 'draft', 'paused', 'closed', 'any']).default('active')
    .describe('"active" (default) = everything not closed; "open" = published only.'),
  limit: z.number().int().min(1).max(20).default(10),
})

export const getJobInput = z.object({
  job_id: z.string().uuid().describe('The job_id from search_jobs.'),
})

export const getPipelineInput = z.object({
  job_id: z.string().uuid().describe('The job_id from search_jobs.'),
  stage: z.string().max(60).optional().describe('Only this stage, by name (e.g. "Screening"). Leave empty for all stages.'),
  limit: z.number().int().min(1).max(50).default(25),
  cursor: z.number().int().min(0).optional().describe('Pass next_cursor from a previous call to get more.'),
})

export const searchJobs = guarded('search_jobs', READ_JOBS, async (args: z.infer<typeof searchJobsInput>, ctx) => {
  const canSee = await jobVisibility(ctx)
  const jobs = (await listJobsForAgent(ctx.supabase, ctx.orgId, { query: args.query, status: args.status })).filter(canSee)
  const page = jobs.slice(0, args.limit)
  const counts = await countActiveApplicationsByJob(ctx.supabase, ctx.orgId, page.map((j) => j.id))
  const data = {
    total_matching: jobs.length,
    jobs: page.map((j) => ({
      job_id: j.id,
      title: j.title,
      status: j.status,
      location: j.location,
      department: j.department,
      active_candidates: counts.get(j.id) ?? 0,
      url: appUrl(`/req-jobs/${j.id}`),
    })),
  }
  return result(data, page.length)
})

export const getJob = guarded('get_job', READ_JOBS, async (args: z.infer<typeof getJobInput>, ctx) => {
  const job = await visibleJob(ctx, args.job_id)
  if (!job) return notFound()
  const [stages, pipeline, icp] = await Promise.all([
    listStagesForAgent(ctx.supabase, ctx.orgId, job.id),
    listPipelineForAgent(ctx.supabase, ctx.orgId, job.id),
    getCurrentIcp(ctx.supabase as never, ctx.orgId, job.id),
  ])
  const perStage = new Map<string, number>()
  for (const p of pipeline) if (p.stage_id) perStage.set(p.stage_id, (perStage.get(p.stage_id) ?? 0) + 1)
  const description = job.description ?? ''
  const data = {
    job_id: job.id,
    title: job.title,
    status: job.status,
    location: job.location,
    department: job.department,
    compensation: compensation(ctx, job),
    description: description.length > DESCRIPTION_LIMIT ? `${description.slice(0, DESCRIPTION_LIMIT)}…` : description,
    ideal_profile: icp
      ? {
          status: icp.status,
          must_haves: icp.must_haves.map((m) => m.label),
          competencies: icp.competencies.map((c) => ({ name: c.name, weight: c.weight, description: c.description ?? null })),
        }
      : null,
    pipeline: stages.filter((s) => (perStage.get(s.id) ?? 0) > 0 || s.order_index >= 0)
      .map((s) => ({ stage: s.name, candidates: perStage.get(s.id) ?? 0 })),
    active_candidates: pipeline.length,
    url: appUrl(`/req-jobs/${job.id}`),
  }
  return result(data, 1)
})

export const getPipeline = guarded('get_pipeline', READ_PIPELINE, async (args: z.infer<typeof getPipelineInput>, ctx) => {
  const job = await visibleJob(ctx, args.job_id)
  if (!job) return notFound()
  const stages = await listStagesForAgent(ctx.supabase, ctx.orgId, job.id)
  let stageFilter: string | undefined
  if (args.stage) {
    const match = stages.find((s) => s.name.toLowerCase() === args.stage!.trim().toLowerCase())
    if (!match) {
      return {
        isError: true,
        content: [{ type: 'text', text: `This job has no stage called "${args.stage}". Its stages are: ${stages.map((s) => s.name).join(', ')}.` }],
        resultCount: 0,
      }
    }
    stageFilter = match.id
  }
  const order = new Map(stages.map((s) => [s.id, s.order_index]))
  const name = new Map(stages.map((s) => [s.id, s.name]))
  const all = (await listPipelineForAgent(ctx.supabase, ctx.orgId, job.id, { stageId: stageFilter })).sort(
    (a, b) =>
      (order.get(b.stage_id ?? '') ?? -99) - (order.get(a.stage_id ?? '') ?? -99) || // furthest along first
      (b.ai_score ?? -1) - (a.ai_score ?? -1),
  )
  const start = args.cursor ?? 0
  const page = all.slice(start, start + args.limit)
  const now = Date.now()
  const data = {
    job_id: job.id,
    job_title: job.title,
    total_active: all.length,
    candidates: page.map((p) => ({
      application_id: p.application_id,
      candidate_id: p.candidate_id,
      name: p.name,
      current_title: p.current_title,
      current_company: p.current_company,
      location: p.location,
      stage: name.get(p.stage_id ?? '') ?? null,
      ai_score: p.ai_score,
      fit: p.fit_bucket,
      days_since_applied: p.applied_at ? Math.floor((now - Date.parse(p.applied_at)) / DAY_MS) : null,
      source: p.source,
    })),
    next_cursor: start + args.limit < all.length ? start + args.limit : null,
    url: appUrl(`/req-jobs/${job.id}`),
  }
  return result(data, page.length)
})

export function registerJobTools(server: McpServer) {
  server.registerTool('search_jobs', {
    title: 'Search jobs',
    description:
      'Find jobs (roles) in the RecruiterStack workspace by title words and status. Returns job_id, title, status, ' +
      'location and how many active candidates each has. Use this first to get the job_id for other tools.',
    inputSchema: searchJobsInput,
    annotations: READ_ONLY,
  }, searchJobs)

  server.registerTool('get_job', {
    title: 'Get job details',
    description:
      "Details of one job: description, ideal candidate profile (must-haves and weighted competencies), and how many " +
      'candidates are in each pipeline stage. Needs a job_id from search_jobs.',
    inputSchema: getJobInput,
    annotations: READ_ONLY,
  }, getJob)

  server.registerTool('get_pipeline', {
    title: 'Get job pipeline',
    description:
      "The candidates in a job's pipeline, furthest stage first: name, current title and company, stage, AI fit score " +
      'and days since applying. No contact details. Optionally filter to one stage by name. Needs a job_id from search_jobs.',
    inputSchema: getPipelineInput,
    annotations: READ_ONLY,
  }, getPipeline)
}
