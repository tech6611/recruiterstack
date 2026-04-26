import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireOrg } from '@/lib/auth'
import { requireAdmin } from '@/lib/auth-admin'
import { parseBody, handleSupabaseError } from '@/lib/api/helpers'
import { departmentCreateSchema } from '@/lib/validations/workspace'

/**
 * GET /api/departments?include_inactive=1 — list departments for current org.
 * Without the flag, only active rows are returned (the dropdown use case).
 * The Settings admin view passes the flag to also see archived rows.
 */
export async function GET(req: NextRequest) {
  const authResult = await requireOrg()
  if (authResult instanceof NextResponse) return authResult
  const { orgId } = authResult

  const includeInactive = req.nextUrl.searchParams.get('include_inactive') === '1'
  const supabase = createAdminClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q: any = supabase
    .from('departments')
    .select('id, name, slug, parent_id, is_active')
    .eq('org_id', orgId)
    .order('name', { ascending: true })
  if (!includeInactive) q = q.eq('is_active', true)

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: data ?? [] })
}

// POST /api/departments — admin-only.
export async function POST(req: NextRequest) {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth

  const body = await parseBody(req, departmentCreateSchema)
  if (body instanceof NextResponse) return body

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('departments')
    .insert({
      org_id:    auth.orgId,
      name:      body.name,
      slug:      body.slug ?? null,
      parent_id: body.parent_id ?? null,
      is_active: body.is_active,
    })
    .select()
    .single()

  if (error) return handleSupabaseError(error)
  return NextResponse.json({ data }, { status: 201 })
}
