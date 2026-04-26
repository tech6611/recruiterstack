import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth-admin'
import { parseBody, handleSupabaseError } from '@/lib/api/helpers'
import { locationUpdateSchema } from '@/lib/validations/workspace'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth

  const body = await parseBody(req, locationUpdateSchema)
  if (body instanceof NextResponse) return body

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('locations')
    .update(body)
    .eq('id', params.id)
    .eq('org_id', auth.orgId)
    .select()
    .single()
  if (error) return handleSupabaseError(error)
  return NextResponse.json({ data })
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('locations')
    .update({ is_active: false })
    .eq('id', params.id)
    .eq('org_id', auth.orgId)
    .select()
    .single()
  if (error) return handleSupabaseError(error)
  return NextResponse.json({ data })
}
