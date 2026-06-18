import { NextRequest, NextResponse } from 'next/server'
import { requireOrgAndUser } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'
import { getViewerScope, assertCapability } from '@/lib/rbac'
import { buildSearchFilter } from '@/lib/api/search'
import { toCsvResponse } from '@/lib/api/csv'

const CSV_HEADERS = [
  'Name', 'Email', 'Phone', 'Status', 'Title', 'Location',
  'Skills', 'Experience (years)', 'Created At',
]

// GET /api/export/candidates?status=active&search=john
export async function GET(req: NextRequest) {
  const authResult = await requireOrgAndUser()
  if (authResult instanceof NextResponse) return authResult
  const { orgId, userId } = authResult

  const supabase = createAdminClient()
  const scope = await getViewerScope(supabase, orgId, userId)
  const denied = assertCapability(scope, 'recruiting:view')
  if (denied) return denied

  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status')
  const search = searchParams.get('search')

  let query = supabase
    .from('candidates')
    .select('name, email, phone, status, current_title, location, skills, experience_years, created_at')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })

  if (status) query = query.eq('status', status as import('@/lib/types/database').CandidateStatus)
  if (search) {
    const filter = buildSearchFilter(search, ['name', 'email', 'current_title', 'location'])
    if (filter) query = query.or(filter)
  }

  const { data, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const rows = (data ?? []).map((c: Record<string, unknown>) => [
    c.name, c.email, c.phone, c.status, c.current_title, c.location,
    c.skills, c.experience_years, c.created_at,
  ])

  const date = new Date().toISOString().slice(0, 10)
  return toCsvResponse(`candidates-${date}.csv`, CSV_HEADERS, rows)
}
