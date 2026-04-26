import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth-admin'
import { parseBody, handleSupabaseError } from '@/lib/api/helpers'
import { groupMembersSetSchema } from '@/lib/validations/approval-groups'

/**
 * PUT /api/admin/approval-groups/:id/members — replace the group's membership
 * with the provided user_ids. Replace-strategy keeps the UI simple: edit a
 * group, set its full member list, save.
 */
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth

  const body = await parseBody(req, groupMembersSetSchema)
  if (body instanceof NextResponse) return body

  const supabase = createAdminClient()

  // Confirm group belongs to this org.
  const { data: group } = await supabase
    .from('approval_groups')
    .select('id')
    .eq('id', params.id)
    .eq('org_id', auth.orgId)
    .maybeSingle()
  if (!group) return NextResponse.json({ error: 'Group not found' }, { status: 404 })

  // Drop existing memberships, insert fresh.
  const { error: delErr } = await supabase
    .from('approval_group_members')
    .delete()
    .eq('group_id', params.id)
  if (delErr) return handleSupabaseError(delErr)

  if (body.user_ids.length === 0) return NextResponse.json({ ok: true })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows: any[] = body.user_ids.map(user_id => ({ group_id: params.id, user_id }))
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: insErr } = await supabase.from('approval_group_members').insert(rows as any)
  if (insErr) return handleSupabaseError(insErr)

  return NextResponse.json({ ok: true })
}
