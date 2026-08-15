import { NextResponse } from 'next/server'
import { withCapability, handleSupabaseError } from '@/lib/api/helpers'
import { getCurrentIcp, refineIcp } from '@/modules/ats/domain/icp'
import { getCanonicalJobScoringContext } from '@/modules/ats/domain/job-pipelines'
import {
  summarizeFeedback,
  suggestRefinement,
  applyRefinement,
  MIN_FEEDBACK,
  type Decision,
  type FeedbackLabel,
} from '@/lib/ai/icp-feedback'

// Loose view of a scored application (Fit-Engine fields aren't in generated types).
interface ScoredApp {
  review_status?: string | null
  ai_scored_at?: string | null
  ai_fit_bucket?: string | null
  ai_score?: number | null
  ai_criterion_scores?: { name: string; rating: number }[] | null
  candidate?: { current_title?: string | null } | null
}

/** POST — propose an ICP refinement from accumulated recruiter Yes/Maybe/No
 *  decisions on this job's scored candidates, as a new draft to review & approve. */
export const POST = withCapability(
  'recruiting:edit',
  async (_req, orgId, supabase, { params }, _scope, userId) => {
    const icp = await getCurrentIcp(supabase, orgId, params.id)
    if (!icp || icp.status !== 'approved') {
      return NextResponse.json({ error: 'This job needs an approved ICP before it can be refined.' }, { status: 400 })
    }

    let context
    try {
      context = await getCanonicalJobScoringContext(supabase, orgId, params.id)
    } catch {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 })
    }
    if (!context) return NextResponse.json({ error: 'Job not found' }, { status: 404 })

    const apps = context.applications as unknown as ScoredApp[]
    const labels: FeedbackLabel[] = apps
      .filter((a) => a.ai_scored_at && (a.review_status === 'yes' || a.review_status === 'no' || a.review_status === 'maybe'))
      .map((a) => ({
        decision: a.review_status as Decision,
        bucket: a.ai_fit_bucket ?? null,
        score: a.ai_score ?? null,
        competencies: (a.ai_criterion_scores ?? []).map((c) => ({ name: c.name, rating: c.rating })),
        title: a.candidate?.current_title ?? null,
      }))

    if (labels.length < MIN_FEEDBACK) {
      return NextResponse.json({
        data: { status: 'insufficient', decided: labels.length, needed: MIN_FEEDBACK },
      })
    }

    try {
      const signal = summarizeFeedback(labels)
      const refinement = await suggestRefinement(icp, signal, labels, { orgId, userId })
      const changes = applyRefinement(icp, refinement)
      const note = refinement.change_summary || 'Refined from recruiter feedback'
      const draft = await refineIcp(supabase, orgId, params.id, changes, note, { createdBy: userId })
      return NextResponse.json(
        { data: { status: 'refined', signal, change_summary: note, icp: draft } },
        { status: 201 },
      )
    } catch (e) {
      return handleSupabaseError(e as { code: string; message: string })
    }
  },
)
