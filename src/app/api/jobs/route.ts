import { NextResponse } from 'next/server'
import { withCapability } from '@/lib/api/helpers'
import { listLegacyJobPipelineSummaries } from '@/modules/ats/domain/job-pipelines'

// GET /api/jobs — list all hiring requests with candidate counts per stage
export const GET = withCapability('recruiting:view', async (_req, orgId, supabase) => {
  try {
    const data = await listLegacyJobPipelineSummaries(supabase, orgId)
    return NextResponse.json({ data })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to list jobs' },
      { status: 500 },
    )
  }
})
