import { NextResponse } from 'next/server'
import { withCapability, parseBody, handleSupabaseError } from '@/lib/api/helpers'
import { buildSearchFilter } from '@/lib/api/search'
import { candidateInsertSchema } from '@/lib/validations/candidates'
import { candidateStatusEnum } from '@/lib/validations/common'
import { findOrCreateCandidateProfile } from '@/modules/ats/domain/candidates'
import type { CandidateListItem } from '@/lib/types/database'

// GET /api/candidates?status=active&limit=50&offset=0
export const GET = withCapability('recruiting:view', async (req, orgId, supabase) => {
  const { searchParams } = new URL(req.url)

  const status = searchParams.get('status')
  const limit = Math.min(Number(searchParams.get('limit') ?? 50), 200)
  const offset = Number(searchParams.get('offset') ?? 0)
  const search = searchParams.get('search')

  // Validate status if provided
  if (status && !candidateStatusEnum.safeParse(status).success) {
    return NextResponse.json({ error: 'Invalid status value' }, { status: 400 })
  }

  let query = supabase
    .from('candidates')
    .select('*', { count: 'exact' })
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (status) query = query.eq('status', status as import('@/lib/types/database').CandidateStatus)
  if (search) {
    // Identity-side search (name / email / phone) lives on `people` post-cleanup;
    // role-side search (current_title / location) stays on candidates. We do a
    // two-step: pre-resolve people ids that match the term, then OR with the
    // candidate-side filter. Cheaper than a forced join + RLS-safe.
    const peopleFilter = buildSearchFilter(search, ['name', 'email', 'phone'])
    const candidateFilter = buildSearchFilter(search, ['current_title', 'location'])
    let personIds: string[] = []
    if (peopleFilter) {
      const { data: ps } = await supabase
        .from('people')
        .select('id')
        .eq('org_id', orgId)
        .or(peopleFilter)
        .limit(500)
      personIds = ((ps ?? []) as Array<{ id: string }>).map(p => p.id)
    }
    if (candidateFilter && personIds.length > 0) {
      // candidates whose person_id matches OR whose current_title/location matches.
      query = query.or(`${candidateFilter},person_id.in.(${personIds.join(',')})`)
    } else if (candidateFilter) {
      query = query.or(candidateFilter)
    } else if (personIds.length > 0) {
      query = query.in('person_id', personIds)
    } else {
      // Search term matched nothing on the people side and no candidate-side filter
      // applies → return empty for the search.
      query = query.eq('id', '00000000-0000-0000-0000-000000000000')
    }
  }

  // Run in parallel: paginated candidates + all active application candidate_ids
  const [{ data, error, count }, appsRes] = await Promise.all([
    query,
    supabase.from('applications').select('candidate_id').eq('status', 'active').eq('org_id', orgId),
  ])

  if (error) return handleSupabaseError(error)

  // Build count map: candidate_id → number of active applications
  const countMap = new Map<string, number>()
  for (const app of (appsRes.data ?? [])) {
    countMap.set(app.candidate_id, (countMap.get(app.candidate_id) ?? 0) + 1)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const enriched: CandidateListItem[] = (data as any[]).map(c => ({
    ...c,
    active_applications_count: countMap.get(c.id) ?? 0,
  }))

  return NextResponse.json({ data: enriched, count, limit, offset })
})

// POST /api/candidates
// Goes through the canonical domain function so a `people` row is found-or-
// created first, then the candidate. Identity (name/email/phone/linkedin)
// lives on people post-Party-Model cleanup; only role-specific fields are
// stored on candidates.
export const POST = withCapability('recruiting:edit', async (req, orgId, supabase) => {
  const body = await parseBody(req, candidateInsertSchema)
  if (body instanceof NextResponse) return body

  try {
    const result = await findOrCreateCandidateProfile(supabase, orgId, {
      name:             body.name,
      email:            body.email,
      phone:            body.phone        ?? null,
      resume_url:       body.resume_url   ?? null,
      current_title:    body.current_title ?? null,
      location:         body.location     ?? null,
      linkedin_url:     body.linkedin_url ?? null,
      skills:           body.skills       ?? [],
      experience_years: body.experience_years ?? 0,
    })
    // Re-fetch the joined row to return the same shape the GET returns.
    const { data, error } = await supabase
      .from('candidates')
      .select('*, person:people(name, email, phone, linkedin_url)')
      .eq('id', result.id).eq('org_id', orgId)
      .single()
    if (error) return handleSupabaseError(error)
    return NextResponse.json({ data }, { status: result.created ? 201 : 200 })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to create candidate' },
      { status: 400 },
    )
  }
})
