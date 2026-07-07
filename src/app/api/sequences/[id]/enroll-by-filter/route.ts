import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { withCapability } from '@/lib/api/helpers'
import { resolveFilteredCandidateIds, type CandidateFilter } from '@/modules/crm/domain/candidate-filter'
import { enrollCandidate } from '@/modules/crm/domain/enroll'

// POST /api/sequences/[id]/enroll-by-filter
//  - { filters, dryRun: true }  → { matched } (preview count, no writes)
//  - { filters }                → enrolls the matched candidates → { matched, enrolled, skipped }
export const POST = withCapability('recruiting:edit', async (req, orgId, supabase, { params }) => {
  const { userId } = auth()

  let body: { filters?: CandidateFilter; dryRun?: boolean }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const filters = body.filters ?? {}
  const candidateIds = await resolveFilteredCandidateIds(supabase, orgId, filters)

  // Preview: count + a sample of the matched candidates (for the live left panel).
  if (body.dryRun) {
    const sampleIds = candidateIds.slice(0, 200)
    let preview: Array<{ id: string; name: string; email: string }> = []
    if (sampleIds.length) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase.from('candidates') as any)
        .select('id, name, email').in('id', sampleIds)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      preview = (data ?? []).map((c: any) => ({ id: c.id, name: c.name ?? '', email: c.email ?? '' }))
    }
    return NextResponse.json({ data: { matched: candidateIds.length, preview } })
  }

  if (candidateIds.length === 0) {
    return NextResponse.json({ data: { matched: 0, enrolled: 0, skipped: 0 } })
  }

  // Commit: sequence must be active.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: seq } = await (supabase.from('sequences') as any)
    .select('id, status').eq('id', params.id).eq('org_id', orgId).single()
  if (!seq) return NextResponse.json({ error: 'Sequence not found' }, { status: 404 })
  if (seq.status !== 'active') {
    return NextResponse.json({ error: 'Sequence must be active to enroll candidates' }, { status: 400 })
  }

  let enrolled = 0
  let skipped = 0
  for (const candidateId of candidateIds) {
    const res = await enrollCandidate(supabase, {
      orgId, sequenceId: params.id, candidateId, enrolledBy: userId ?? null,
    })
    if (res.enrolled) enrolled++
    else skipped++
  }

  return NextResponse.json({ data: { matched: candidateIds.length, enrolled, skipped } }, { status: 201 })
})
