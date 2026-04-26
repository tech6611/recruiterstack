import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireOrg } from '@/lib/auth'
import { requireAdmin } from '@/lib/auth-admin'
import { parseBody, handleSupabaseError } from '@/lib/api/helpers'
import { locationCreateSchema } from '@/lib/validations/workspace'

export async function GET(req: NextRequest) {
  const authResult = await requireOrg()
  if (authResult instanceof NextResponse) return authResult
  const { orgId } = authResult

  const includeInactive = req.nextUrl.searchParams.get('include_inactive') === '1'
  const supabase = createAdminClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q: any = supabase
    .from('locations')
    .select('id, name, city, state, country, postal_code, remote_type, timezone, is_active')
    .eq('org_id', orgId)
    .order('name', { ascending: true })
  if (!includeInactive) q = q.eq('is_active', true)

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: data ?? [] })
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth

  const body = await parseBody(req, locationCreateSchema)
  if (body instanceof NextResponse) return body

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('locations')
    .insert({
      org_id:      auth.orgId,
      name:        body.name,
      city:        body.city ?? null,
      state:       body.state ?? null,
      country:     body.country ?? null,
      postal_code: body.postal_code ?? null,
      remote_type: body.remote_type,
      timezone:    body.timezone ?? null,
      is_active:   body.is_active,
    })
    .select()
    .single()

  if (error) return handleSupabaseError(error)
  return NextResponse.json({ data }, { status: 201 })
}
