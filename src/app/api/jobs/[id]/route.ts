import { NextResponse } from 'next/server'
import { withCapability } from '@/lib/api/helpers'
import { getCanonicalJobBoardDetail } from '@/modules/ats/domain/job-pipelines'

// GET /api/jobs/[id] — canonical job with pipeline stages + applications (candidates joined) (Phase 3 / C4)
export const GET = withCapability('recruiting:view', async (_req, orgId, supabase, { params }) => {
  const { id } = params

  let data
  try {
    data = await getCanonicalJobBoardDetail(supabase, orgId, id)
  } catch (err) {
    // A query failure is a server error, not a missing job — surface it instead
    // of disguising it as a 404 (which hid the real cause from the board page).
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to load job' },
      { status: 500 },
    )
  }

  if (!data) {
    // TEMP DIAGNOSTIC (read-only): the row isn't visible under the resolved org.
    // Look it up ignoring the org filter so we can see what's actually going on —
    // resolved org vs. the row's real org, or whether the id matches no row at all.
    // Remove once the "Job not found" mystery is solved.
    const probe = await (supabase as any)
      .from('jobs')
      .select('id, org_id, title, status')
      .eq('id', id)
      .maybeSingle()
    return NextResponse.json(
      {
        error: 'Job not found',
        _diagnostic: {
          requestedId: id,
          resolvedOrgId: orgId,
          rowExistsIgnoringOrg: !!probe.data,
          rowOrgId: probe.data?.org_id ?? null,
          rowTitle: probe.data?.title ?? null,
          rowStatus: probe.data?.status ?? null,
          probeError: probe.error?.message ?? null,
        },
      },
      { status: 404 },
    )
  }

  return NextResponse.json(
    { data },
    {
      headers: { 'Cache-Control': 'no-store' },
    },
  )
})
