import { NextResponse } from 'next/server'
import { withCapability, handleSupabaseError } from '@/lib/api/helpers'

// Tables not yet in the generated Supabase types.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LooseSb = any

/** GET — enrollments from THIS job's Source tab that are held for review (8b-2),
 *  with the personalized first message so the recruiter can read it before it sends. */
export const GET = withCapability('recruiting:view', async (_req, orgId, supabase, { params }) => {
  try {
    const { data, error } = await (supabase as unknown as LooseSb)
      .from('sequence_enrollments')
      .select('id, sequence_id, candidate_id, intro_subject, intro_body, started_at, candidates(name, current_title, email), sequences(name)')
      .eq('org_id', orgId)
      .eq('job_id', params.id)
      .eq('awaiting_review', true)
      .order('started_at', { ascending: false })
    if (error) return handleSupabaseError(error)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pending = (data ?? []).map((r: any) => ({
      enrollment_id: r.id,
      sequence_id: r.sequence_id,
      sequence_name: r.sequences?.name ?? 'Sequence',
      candidate_id: r.candidate_id,
      candidate_name: r.candidates?.name ?? 'Candidate',
      candidate_title: r.candidates?.current_title ?? null,
      candidate_email: r.candidates?.email ?? null,
      subject: r.intro_subject ?? '',
      body: r.intro_body ?? '',
      started_at: r.started_at,
    }))
    return NextResponse.json({ data: { pending } })
  } catch (e) {
    return handleSupabaseError(e as { code: string; message: string })
  }
})
