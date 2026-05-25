import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireOrg } from '@/lib/auth'
import { buildSearchFilter } from '@/lib/api/search'
import { createRoleProfile, listRoleProfiles } from '@/modules/ats/domain/role-profiles'
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

  let searchFilter: string | null = null
  if (search) {
    const filter = buildSearchFilter(search, ['job_title', 'department', 'location'])
    if (filter) searchFilter = filter
  }

  try {
    const { data, count } = await listRoleProfiles(supabase, orgId, {
      status,
      limit,
      offset,
      searchFilter,
    })
    return NextResponse.json({ data, count, limit, offset })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to list roles' },
      { status: 500 },
    )
  }
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

  try {
    const data = await createRoleProfile(supabase, orgId, body)
    return NextResponse.json({ data }, { status: 201 })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to create role' },
      { status: 500 },
    )
  }
}
