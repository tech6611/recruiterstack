import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireOrgAndUser } from '@/lib/auth'
import { requireAdmin } from '@/lib/auth-admin'
import { parseBody, handleSupabaseError } from '@/lib/api/helpers'
import { customFieldCreateSchema } from '@/lib/validations/custom-fields'

// GET /api/admin/custom-fields?object_type=opening
// Available to any member (the opening form needs them); writes are admin-only.
export async function GET(req: NextRequest) {
  const auth = await requireOrgAndUser()
  if (auth instanceof NextResponse) return auth

  const objectType = req.nextUrl.searchParams.get('object_type')
  const includeInactive = req.nextUrl.searchParams.get('include_inactive') === '1'

  const supabase = createAdminClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q: any = supabase
    .from('custom_field_definitions')
    .select('*')
    .eq('org_id', auth.orgId)
    .order('order_index', { ascending: true })
    .order('created_at', { ascending: true })
  if (objectType) q = q.eq('object_type', objectType)
  if (!includeInactive) q = q.eq('is_active', true)

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: data ?? [] })
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth

  const body = await parseBody(req, customFieldCreateSchema)
  if (body instanceof NextResponse) return body

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('custom_field_definitions')
    .insert({
      org_id:      auth.orgId,
      object_type: body.object_type,
      field_key:   body.field_key,
      label:       body.label,
      field_type:  body.field_type,
      options:     body.options ?? null,
      required:    body.required,
      order_index: body.order_index,
      is_active:   body.is_active,
    })
    .select()
    .single()

  if (error) return handleSupabaseError(error)
  return NextResponse.json({ data }, { status: 201 })
}
