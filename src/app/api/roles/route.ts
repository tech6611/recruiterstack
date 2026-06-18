import { NextResponse } from 'next/server'
import { withCapability } from '@/lib/api/helpers'
import { buildSearchFilter } from '@/lib/api/search'
import { createRoleProfile, listRoleProfiles } from '@/modules/ats/domain/role-profiles'
import type { RoleInsert, RoleStatus } from '@/lib/types/database'

// GET /api/roles?status=active&limit=50&offset=0&search=engineer
export const GET = withCapability('recruiting:view', async (request, orgId, supabase) => {
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
})

// POST /api/roles
export const POST = withCapability('recruiting:edit', async (request, orgId, supabase) => {
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
})
