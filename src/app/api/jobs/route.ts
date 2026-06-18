import { NextResponse } from 'next/server'
import { withCapability } from '@/lib/api/helpers'
import { listCanonicalJobBoardSummaries } from '@/modules/ats/domain/job-pipelines'

// GET /api/jobs — list canonical jobs with candidate counts per stage (Phase 3 / C4)
export const GET = withCapability('recruiting:view', async (_req, orgId, supabase) => {
  try {
    const data = await listCanonicalJobBoardSummaries(supabase, orgId)
    return NextResponse.json({ data })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to list jobs' },
      { status: 500 },
    )
  }
})
