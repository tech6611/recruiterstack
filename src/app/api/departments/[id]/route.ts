import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth-admin'
import { parseBody, handleSupabaseError } from '@/lib/api/helpers'
import { departmentUpdateSchema } from '@/lib/validations/workspace'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth

  const body = await parseBody(req, departmentUpdateSchema)
  if (body instanceof NextResponse) return body

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('departments')
    .update(body)
    .eq('id', params.id)
    .eq('org_id', auth.orgId)
    .select()
    .single()
  if (error) return handleSupabaseError(error)
  return NextResponse.json({ data })
}

// DELETE — soft-archive (is_active=false). Hard delete reserved for SQL.
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('departments')
    .update({ is_active: false })
    .eq('id', params.id)
    .eq('org_id', auth.orgId)
    .select()
    .single()
  if (error) return handleSupabaseError(error)
  return NextResponse.json({ data })
}
