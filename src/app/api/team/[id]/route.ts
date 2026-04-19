import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireOrgAndUser } from '@/lib/auth'
import { parseBody } from '@/lib/api/helpers'
import { memberPatchSchema } from '@/lib/validations/team'

/**
 * PATCH /api/team/:member_id — update role and/or is_active.
 * Admin-only. Never allows the last admin to demote or deactivate themselves
 * (we'd lock the org out of admin access).
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const authResult = await requireOrgAndUser()
  if (authResult instanceof NextResponse) return authResult
  const { orgId, userId } = authResult

  const supabase = createAdminClient()

  // Gate: caller must be admin.
  const { data: caller } = await supabase
    .from('org_members')
    .select('role')
    .eq('org_id', orgId)
    .eq('user_id', userId)
    .maybeSingle()

  if ((caller as { role: string } | null)?.role !== 'admin') {
    return NextResponse.json({ error: 'Only admins can change team roles.' }, { status: 403 })
  }

  const body = await parseBody(req, memberPatchSchema)
  if (body instanceof NextResponse) return body

  // Guard against orphaning the org (removing the last active admin).
  const target = await supabase
    .from('org_members')
    .select('user_id, role, is_active')
    .eq('id', params.id)
    .eq('org_id', orgId)
    .maybeSingle()

  const currentTarget = target.data as { user_id: string; role: string; is_active: boolean } | null
  if (!currentTarget) {
    return NextResponse.json({ error: 'Member not found' }, { status: 404 })
  }

  const wouldDemote    = currentTarget.role === 'admin' && body.role !== undefined && body.role !== 'admin'
  const wouldDeactivate = currentTarget.is_active && body.is_active === false && currentTarget.role === 'admin'

  if (wouldDemote || wouldDeactivate) {
    const { count } = await supabase
      .from('org_members')
      .select('user_id', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .eq('role', 'admin')
      .eq('is_active', true)

    if ((count ?? 0) <= 1) {
      return NextResponse.json(
        { error: 'Cannot demote or deactivate the last admin.' },
        { status: 409 },
      )
    }
  }

  const patch: Record<string, unknown> = {}
  if (body.role      !== undefined) patch.role      = body.role
  if (body.is_active !== undefined) patch.is_active = body.is_active

  const { data, error } = await supabase
    .from('org_members')
    .update(patch)
    .eq('id', params.id)
    .eq('org_id', orgId)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}
