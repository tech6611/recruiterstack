import { NextResponse } from 'next/server'
import { withCapability } from '@/lib/api/helpers'
import { listCanonicalJobBoardSummaries } from '@/modules/ats/domain/job-pipelines'

// GET /api/jobs — list canonical jobs with candidate counts per stage (Phase 3 / C4)
export const GET = withCapability('recruiting:view', async (_req, orgId, supabase) => {
  try {
    const data = await listCanonicalJobBoardSummaries(supabase, orgId)
    // Never serve a cached board list — a job deleted in the DB must disappear on
    // the next load, not linger behind a stale cached response (mirrors the
    // no-store on GET /api/jobs/[id]).
    return NextResponse.json({ data }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to list jobs' },
      { status: 500 },
    )
  }
})
