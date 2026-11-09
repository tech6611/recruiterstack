import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/server'
import { getJobForAgent, getCandidateDetailForMcp, listFitForAgent, getOutreachNames } from '@/modules/ats/domain/agent-reads'
import { draftOutreachIntro } from '@/lib/ai/outreach-draft'
import { guarded, type ToolResult } from '../tool'
import type { McpContext } from '../guard'
import { jobVisibility, appUrl } from '../visibility'

/**
 * draft_candidate_outreach — writes a personalised first message (email or LinkedIn)
 * for a candidate about a job, citing why they fit (from the Fit Engine's stored
 * assessment when there is one). TEXT ONLY: nothing is sent, saved or scheduled.
 * Uses the same writer as sourcing sequences (src/lib/ai/outreach-draft.ts), which
 * treats candidate text as data, never instructions. One Gemini Flash call per draft.
 */

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, openWorldHint: false } as const

export const draftOutreachInput = z.object({
  candidate_id: z.string().uuid().describe('The candidate_id (from get_pipeline, search_candidates or rank_candidates_for_job).'),
  job_id: z.string().uuid().describe('The job_id the message is about.'),
  channel: z.enum(['email', 'linkedin']).default('email'),
  tone: z.enum(['warm', 'direct', 'formal']).default('warm'),
})

const err = (text: string): ToolResult & { resultCount: number } => ({ isError: true, content: [{ type: 'text', text }], resultCount: 0 })

function firstName(full: string | null): string {
  return (full ?? '').trim().split(/\s+/)[0] || 'there'
}

export const draftCandidateOutreach = guarded('draft_candidate_outreach', { scope: 'candidates:read', capability: 'recruiting:view' },
  async (args: z.infer<typeof draftOutreachInput>, ctx: McpContext) => {
    if (!process.env.GEMINI_API_KEY) return err('AI drafting is not configured on this RecruiterStack server.')
    const job = await getJobForAgent(ctx.supabase, ctx.orgId, args.job_id)
    const canSee = await jobVisibility(ctx)
    if (!job || !canSee(job)) return err('No job with that ID was found in this RecruiterStack workspace. Use search_jobs to find the right job_id.')

    const candidate = await getCandidateDetailForMcp(ctx.supabase, ctx.orgId, args.candidate_id)
    const limited = !ctx.viewer.capabilities.has('recruiting:view')
    const onAVisibleJob = candidate?.applications.some((a) => a.job_id && canSee({ id: a.job_id, confidentiality: a.job_confidentiality }))
    if (!candidate || (limited && !onAVisibleJob)) {
      return err('No candidate with that ID was found in this RecruiterStack workspace.')
    }

    // Why they fit: the stored Fit Engine assessment for THIS job, if scored.
    const fit = (await listFitForAgent(ctx.supabase, ctx.orgId, job.id)).find((r) => r.candidate_id === candidate.id)
    const evidence = [
      ...(fit?.strengths ?? []),
      ...((fit?.criterion_scores ?? []) as Array<{ evidence?: string }>).map((c) => c.evidence ?? '').filter(Boolean),
    ].slice(0, 4)
    const names = await getOutreachNames(ctx.supabase, ctx.orgId, ctx.userId)

    const draft = await draftOutreachIntro(
      {
        first_name: firstName(candidate.name),
        candidate_title: [candidate.current_title, candidate.current_company].filter(Boolean).join(' at ') || null,
        role_title: job.title,
        company_name: names.companyName ?? 'our company',
        recruiter_name: names.recruiterName ?? 'The hiring team',
        why_they_fit: null,
        evidence,
        channel: args.channel,
        tone: args.tone,
      },
      { orgId: ctx.orgId, userId: ctx.userId },
    )

    const data = {
      channel: args.channel,
      to: { candidate_id: candidate.id, name: candidate.name },
      job: { job_id: job.id, title: job.title },
      subject: args.channel === 'email' ? draft.subject : null,
      body: draft.body,
      personalised_from: evidence.length ? 'the candidate\'s AI fit assessment for this job' : 'their profile only (not scored for this job yet)',
      note: 'Draft only — nothing was sent or saved. Review and edit before sending from your own email or LinkedIn.',
      candidate_url: appUrl(`/candidates/${candidate.id}`),
    }
    return { structuredContent: data, content: [{ type: 'text', text: JSON.stringify(data) }], resultCount: 1 }
  })

export function registerOutreachTools(server: McpServer) {
  server.registerTool('draft_candidate_outreach', {
    title: 'Draft candidate outreach',
    description:
      'Write a short, personalised outreach message (email or LinkedIn) to a candidate about a job, citing why they fit. ' +
      'Returns text only — it never sends, saves or schedules anything. The user reviews and sends it themselves.',
    inputSchema: draftOutreachInput,
    annotations: READ_ONLY,
  }, draftCandidateOutreach)
}
