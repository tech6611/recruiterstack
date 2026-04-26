import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth-admin'
import { parseBody, handleSupabaseError } from '@/lib/api/helpers'
import { compBandUpdateSchema } from '@/lib/validations/workspace'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth

  const body = await parseBody(req, compBandUpdateSchema)
  if (body instanceof NextResponse) return body

  // Cross-field min/max consistency: only enforce if BOTH are present in patch.
  if (body.min_salary !== undefined && body.max_salary !== undefined && body.min_salary > body.max_salary) {
    return NextResponse.json({ error: 'min_salary must be ≤ max_salary' }, { status: 400 })
  }

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('compensation_bands')
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
    .from('compensation_bands')
    .update({ is_active: false })
    .eq('id', params.id)
    .eq('org_id', auth.orgId)
    .select()
    .single()
  if (error) return handleSupabaseError(error)
  return NextResponse.json({ data })
}
