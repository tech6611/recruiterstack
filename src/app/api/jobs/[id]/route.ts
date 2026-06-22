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

  if (!data) return NextResponse.json({ error: 'Job not found' }, { status: 404 })

  return NextResponse.json(
    { data },
    {
      headers: { 'Cache-Control': 'no-store' },
    },
  )
})
