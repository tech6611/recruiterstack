import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { withCapability } from '@/lib/api/helpers'
import { enrollCandidate } from '@/modules/crm/domain/enroll'

// POST /api/sequences/[id]/enroll — enroll candidates
export const POST = withCapability('recruiting:edit', async (req, orgId, supabase, { params }) => {
  const { userId } = auth()

  let body: { candidate_ids: string[]; application_id?: string }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  if (!body.candidate_ids?.length) {
    return NextResponse.json({ error: 'candidate_ids required' }, { status: 400 })
  }

  // Upfront sequence check for a clean 404/400 (enrollCandidate re-checks per call).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: seq } = await (supabase.from('sequences') as any)
    .select('id, status').eq('id', params.id).eq('org_id', orgId).single()
  if (!seq) return NextResponse.json({ error: 'Sequence not found' }, { status: 404 })
  if (seq.status !== 'active') {
    return NextResponse.json({ error: 'Sequence must be active to enroll candidates' }, { status: 400 })
  }

  let enrolled = 0
  let skipped = 0
  for (const candidateId of body.candidate_ids) {
    const res = await enrollCandidate(supabase, {
      orgId,
      sequenceId: params.id,
      candidateId,
      applicationId: body.application_id ?? null,
      enrolledBy: userId ?? null,
    })
    if (res.enrolled) enrolled++
    else skipped++
  }

  return NextResponse.json({
    data: { enrolled_count: enrolled, skipped_count: skipped },
  }, { status: 201 })
})
