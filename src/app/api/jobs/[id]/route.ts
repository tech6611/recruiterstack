import { NextResponse } from 'next/server'
import { withCapability } from '@/lib/api/helpers'
import { getLegacyJobPipelineDetail } from '@/modules/ats/domain/job-pipelines'

// GET /api/jobs/[id] — job with pipeline stages + active applications (candidates joined)
export const GET = withCapability('recruiting:view', async (_req, orgId, supabase, { params }) => {
  const { id } = params

  let data
  try {
    data = await getLegacyJobPipelineDetail(supabase, orgId, id)
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
