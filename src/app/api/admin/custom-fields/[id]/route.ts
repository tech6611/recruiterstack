import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth-admin'
import { parseBody, handleSupabaseError } from '@/lib/api/helpers'
import { customFieldUpdateSchema } from '@/lib/validations/custom-fields'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth

  const body = await parseBody(req, customFieldUpdateSchema)
  if (body instanceof NextResponse) return body

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('custom_field_definitions')
    .update(body)
    .eq('id', params.id)
    .eq('org_id', auth.orgId)
    .select()
    .single()
  if (error) return handleSupabaseError(error)
  return NextResponse.json({ data })
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth

  const supabase = createAdminClient()
  const { error } = await supabase
    .from('custom_field_definitions')
    .update({ is_active: false })
    .eq('id', params.id)
    .eq('org_id', auth.orgId)
  if (error) return handleSupabaseError(error)
  return NextResponse.json({ ok: true })
}
