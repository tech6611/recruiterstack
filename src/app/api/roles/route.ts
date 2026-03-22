import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireOrg } from '@/lib/auth'
import { buildSearchFilter } from '@/lib/api/search'
import type { RoleInsert, RoleStatus } from '@/lib/types/database'

// GET /api/roles?status=active&limit=50&offset=0&search=engineer
export async function GET(request: NextRequest) {
  const authResult = await requireOrg()
  if (authResult instanceof NextResponse) return authResult
  const { orgId } = authResult

  const supabase = createAdminClient()
  const { searchParams } = new URL(request.url)

  const status = searchParams.get('status') as RoleStatus | null
  const limit = Math.min(Number(searchParams.get('limit') ?? 50), 200)
  const offset = Number(searchParams.get('offset') ?? 0)
  const search = searchParams.get('search')

  let query = supabase
    .from('roles')
    .select('*', { count: 'exact' })
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (status) query = query.eq('status', status)
  if (search) {
    const filter = buildSearchFilter(search, ['job_title', 'department', 'location'])
    if (filter) query = query.or(filter)
  }

  const { data, error, count } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data, count, limit, offset })
}

// POST /api/roles
export async function POST(request: NextRequest) {
  const authResult = await requireOrg()
  if (authResult instanceof NextResponse) return authResult
  const { orgId } = authResult

  const supabase = createAdminClient()

  let body: RoleInsert
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (!body.job_title) {
    return NextResponse.json({ error: 'job_title is required' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('roles')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .insert({ ...body, org_id: orgId } as any)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data }, { status: 201 })
}
