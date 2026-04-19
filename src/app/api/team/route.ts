import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireOrgAndUser } from '@/lib/auth'

// GET /api/team — lists org members. Any member can view.
// Each row includes the user's email/name joined from users.
export async function GET() {
  const authResult = await requireOrgAndUser()
  if (authResult instanceof NextResponse) return authResult
  const { orgId } = authResult

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('org_members')
    .select('id, user_id, role, is_active, onboarded_at, created_at, updated_at, users:user_id (id, email, full_name, first_name, last_name, avatar_url)')
    .eq('org_id', orgId)
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: data ?? [] })
}
