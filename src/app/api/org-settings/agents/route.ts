import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireOrgAndUser } from '@/lib/auth'

// GET /api/org-settings/agents — returns the enabled_agents list.
export async function GET() {
  const authResult = await requireOrgAndUser()
  if (authResult instanceof NextResponse) return authResult
  const { orgId } = authResult

  const supabase = createAdminClient()
  const { data } = await supabase
    .from('org_settings')
    .select('enabled_agents')
    .eq('org_id', orgId)
    .maybeSingle()

  return NextResponse.json({
    data: { enabled_agents: (data as { enabled_agents: string[] } | null)?.enabled_agents ?? [] },
  })
}
