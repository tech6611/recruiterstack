import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireOrg } from '@/lib/auth'
import type { CandidateInsert, CandidateListItem, CandidateStatus } from '@/lib/types/database'

// GET /api/candidates?status=active&limit=50&offset=0
export async function GET(request: NextRequest) {
  const authResult = await requireOrg()
  if (authResult instanceof NextResponse) return authResult
  const { orgId } = authResult

  const supabase = createAdminClient()
  const { searchParams } = new URL(request.url)

  const status = searchParams.get('status') as CandidateStatus | null
  const limit = Math.min(Number(searchParams.get('limit') ?? 50), 200)
  const offset = Number(searchParams.get('offset') ?? 0)
  const search = searchParams.get('search')

  let query = supabase
    .from('candidates')
    .select('*', { count: 'exact' })
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (status) query = query.eq('status', status)
  if (search) {
    query = query.or(
      `name.ilike.%${search}%,email.ilike.%${search}%,current_title.ilike.%${search}%,phone.ilike.%${search}%,location.ilike.%${search}%`,
    )
  }

  // Run in parallel: paginated candidates + all active application candidate_ids
  const [{ data, error, count }, appsRes] = await Promise.all([
    query,
    supabase.from('applications').select('candidate_id').eq('status', 'active').eq('org_id', orgId),
  ])

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

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
}

// POST /api/candidates
export async function POST(request: NextRequest) {
  const authResult = await requireOrg()
  if (authResult instanceof NextResponse) return authResult
  const { orgId } = authResult

  const supabase = createAdminClient()

  let body: CandidateInsert
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (!body.name || !body.email) {
    return NextResponse.json(
      { error: 'name and email are required' },
      { status: 400 },
    )
  }

  const { data, error } = await supabase
    .from('candidates')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .insert({ ...body, org_id: orgId } as any)
    .select()
    .single()

  if (error) {
    const status = error.code === '23505' ? 409 : 500 // unique violation
    return NextResponse.json({ error: error.message }, { status })
  }

  return NextResponse.json({ data }, { status: 201 })
}
