import { NextResponse } from 'next/server'
import { confidentialFilter, jobVisible } from '@/lib/jobs/confidential'
import { withCapability } from '@/lib/api/helpers'
import { listCanonicalJobBoardSummaries } from '@/modules/ats/domain/job-pipelines'

// GET /api/jobs — list canonical jobs with candidate counts per stage (Phase 3 / C4)
export const GET = withCapability('recruiting:view', async (_req, orgId, supabase, _params, scope) => {
  try {
    const all = await listCanonicalJobBoardSummaries(supabase, orgId)
    // Confidential jobs: only admins, the creator, and people with a role on the job.
    const cf = await confidentialFilter(supabase, orgId, scope)
    const data = all.filter(j => jobVisible(cf, { id: j.id }))
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
