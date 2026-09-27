import { NextResponse } from 'next/server'
import { withCapability } from '@/lib/api/helpers'

/**
 * GET /api/candidates/[id]/sequences — every outreach sequence this candidate is or was
 * enrolled in, newest first.
 *
 * WHY A CANDIDATE-SCOPED ROUTE AT ALL. Sequences have always been read the other way
 * round — open a sequence, see who is in it — which answers the campaign owner's
 * question, not the recruiter's. Looking at one person, what you want to know is
 * "have we already emailed them, and did they reply", and there was no way to ask that
 * without opening every sequence.
 *
 * `sequence_enrollments` carries `candidate_id` directly, so this is a plain scoped
 * read rather than a join through applications — which matters, because a candidate can
 * be enrolled with no application at all.
 */
export const GET = withCapability('recruiting:view', async (_req, orgId, supabase, { params }) => {
  const { data, error } = await supabase
    .from('sequence_enrollments')
    .select('id, sequence_id, status, current_stage_index, next_send_at, started_at, completed_at, sequences(name)')
    .eq('candidate_id', params.id)
    .eq('org_id', orgId)
    .order('started_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Flatten the joined name so the client never has to know the table shape.
  const rows = (data ?? []).map((r) => {
    const seq = r.sequences as unknown as { name?: string } | { name?: string }[] | null
    const name = Array.isArray(seq) ? seq[0]?.name : seq?.name
    return {
      id: r.id,
      sequence_id: r.sequence_id,
      sequence_name: name ?? 'Sequence',
      status: r.status,
      current_stage_index: r.current_stage_index,
      next_send_at: r.next_send_at,
      started_at: r.started_at,
      completed_at: r.completed_at,
    }
  })

  return NextResponse.json({ data: rows })
})
