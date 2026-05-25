import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireOrg } from '@/lib/auth'
import { listLegacyJobPipelineSummaries } from '@/modules/ats/domain/job-pipelines'

// GET /api/jobs — list all hiring requests with candidate counts per stage
export async function GET() {
  const authResult = await requireOrg()
  if (authResult instanceof NextResponse) return authResult
  const { orgId } = authResult

  const supabase = createAdminClient()
  try {
    const data = await listLegacyJobPipelineSummaries(supabase, orgId)
    return NextResponse.json({ data })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to list jobs' },
      { status: 500 },
    )
  }
}
