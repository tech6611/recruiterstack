import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireOrg } from '@/lib/auth'
import { getLegacyJobPipelineDetail } from '@/modules/ats/domain/job-pipelines'

// GET /api/jobs/[id] — job with pipeline stages + active applications (candidates joined)
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const authResult = await requireOrg()
  if (authResult instanceof NextResponse) return authResult
  const { orgId } = authResult

  const supabase = createAdminClient()
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
}
