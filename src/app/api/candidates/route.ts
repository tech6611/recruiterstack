import { NextResponse } from 'next/server'
import { withOrg, parseBody, handleSupabaseError } from '@/lib/api/helpers'
import { buildSearchFilter } from '@/lib/api/search'
import { candidateInsertSchema } from '@/lib/validations/candidates'
import { candidateStatusEnum } from '@/lib/validations/common'
import type { CandidateListItem } from '@/lib/types/database'

// GET /api/candidates?status=active&limit=50&offset=0
export const GET = withOrg(async (req, orgId, supabase) => {
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

  if (status) query = query.eq('status', status)
  if (search) {
    const filter = buildSearchFilter(search, ['name', 'email', 'current_title', 'phone', 'location'])
    if (filter) query = query.or(filter)
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
export const POST = withOrg(async (req, orgId, supabase) => {
  const body = await parseBody(req, candidateInsertSchema)
  if (body instanceof NextResponse) return body

  const { data, error } = await supabase
    .from('candidates')
    .insert({ ...body, org_id: orgId })
    .select()
    .single()

  if (error) return handleSupabaseError(error)

  return NextResponse.json({ data }, { status: 201 })
})
