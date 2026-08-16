import { NextResponse } from 'next/server'
import { withCapability, handleSupabaseError } from '@/lib/api/helpers'
import { reviewJobPost } from '@/lib/ai/job-post-review'

// jobs.custom_fields shape isn't in the generated types; loose-read the intake bits.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LooseSb = any

export const maxDuration = 60 // one Gemini review pass

/** POST — QA-review this job's post (Component 13). Read-only: returns suggestions;
 *  the recruiter edits the description themselves. */
export const POST = withCapability(
  'recruiting:edit',
  async (_req, orgId, supabase, { params }, _scope, userId) => {
    const { data: job, error } = await (supabase as unknown as LooseSb)
      .from('jobs')
      .select('title, description, custom_fields')
      .eq('org_id', orgId)
      .eq('id', params.id)
      .maybeSingle()
    if (error) return handleSupabaseError(error)
    if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 })
    if (!job.description) {
      return NextResponse.json({ error: 'This job has no description to review yet.' }, { status: 400 })
    }

    const cf = (job.custom_fields ?? {}) as Record<string, unknown>
    try {
      const review = await reviewJobPost(
        {
          title: job.title ?? '',
          description: job.description ?? '',
          level: typeof cf.level === 'string' ? cf.level : null,
          location: typeof cf.location === 'string' ? cf.location : null,
        },
        { orgId, userId },
      )
      return NextResponse.json({ data: review })
    } catch (e) {
      return handleSupabaseError(e as { code: string; message: string })
    }
  },
)
