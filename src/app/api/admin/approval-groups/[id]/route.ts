import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireOrgAndUser } from '@/lib/auth'
import { requireAdmin } from '@/lib/auth-admin'
import { parseBody, handleSupabaseError } from '@/lib/api/helpers'
import { groupUpdateSchema } from '@/lib/validations/approval-groups'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireOrgAndUser()
  if (auth instanceof NextResponse) return auth

  const supabase = createAdminClient()
  const { data: group } = await supabase
    .from('approval_groups')
    .select('*')
    .eq('id', params.id)
    .eq('org_id', auth.orgId)
    .maybeSingle()
  if (!group) return NextResponse.json({ error: 'Group not found' }, { status: 404 })

  const { data: members } = await supabase
    .from('approval_group_members')
    .select('user_id, users:user_id (id, email, full_name)')
    .eq('group_id', params.id)

  return NextResponse.json({ data: { group, members: members ?? [] } })
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth

  const body = await parseBody(req, groupUpdateSchema)
  if (body instanceof NextResponse) return body

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('approval_groups')
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
  const { error } = await supabase
    .from('approval_groups')
    .update({ is_active: false })
    .eq('id', params.id)
    .eq('org_id', auth.orgId)
  if (error) return handleSupabaseError(error)
  return NextResponse.json({ ok: true })
}
