import { NextResponse } from 'next/server'
import { withCapability } from '@/lib/api/helpers'
import { getCanonicalJobBoardDetail } from '@/modules/ats/domain/job-pipelines'

// GET /api/jobs/[id] — canonical job with pipeline stages + applications (candidates joined) (Phase 3 / C4)
export const GET = withCapability('recruiting:view', async (_req, orgId, supabase, { params }) => {
  const { id } = params

  let data
  try {
    data = await getCanonicalJobBoardDetail(supabase, orgId, id)
  } catch {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 })
  }

  if (!data) return NextResponse.json({ error: 'Job not found' }, { status: 404 })

  return NextResponse.json(
    { data },
    {
      headers: { 'Cache-Control': 'no-store' },
    },
  )
})
