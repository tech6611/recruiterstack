import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireOrgAndUser } from '@/lib/auth'

// GET /api/org-settings/company — returns company info fields only.
// Read-available to any org member; write happens via PATCH /api/org-settings
// (admin-only there).
export async function GET() {
  const authResult = await requireOrgAndUser()
  if (authResult instanceof NextResponse) return authResult
  const { orgId } = authResult

  const supabase = createAdminClient()
  const { data } = await supabase
    .from('org_settings')
    .select('company_name, company_size, industry, website')
    .eq('org_id', orgId)
    .maybeSingle()

  return NextResponse.json({ data: data ?? { company_name: null, company_size: null, industry: null, website: null } })
}
