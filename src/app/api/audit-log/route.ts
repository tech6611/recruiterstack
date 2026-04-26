import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireOrgAndUser } from '@/lib/auth'

/**
 * GET /api/audit-log?target_type=opening&target_id=...
 * Returns chronological audit entries for a target. Admins + members can read
 * (the audit log is for transparency, not access-controlled state).
 */
export async function GET(req: NextRequest) {
  const auth = await requireOrgAndUser()
  if (auth instanceof NextResponse) return auth
  const { orgId } = auth

  const targetType = req.nextUrl.searchParams.get('target_type')
  const targetId   = req.nextUrl.searchParams.get('target_id')
  if (!targetType || !targetId) {
    return NextResponse.json({ error: 'target_type and target_id are required' }, { status: 400 })
  }

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('approval_audit_log')
    .select('id, action, from_state, to_state, metadata, actor_user_id, created_at, users:actor_user_id (full_name, email)')
    .eq('org_id', orgId)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .eq('target_type', targetType as any)
    .eq('target_id', targetId)
    .order('created_at', { ascending: false })
    .limit(200)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: data ?? [] })
}
