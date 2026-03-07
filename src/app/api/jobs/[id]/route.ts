import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

// GET /api/jobs/[id] — job with pipeline stages + active applications (candidates joined)
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createAdminClient()
  const { id } = params
  const debug = req.nextUrl.searchParams.get('debug') === '1'

  const [jobRes, stagesRes, appsRes] = await Promise.all([
    supabase.from('hiring_requests').select('*').eq('id', id).single(),
    supabase
      .from('pipeline_stages')
      .select('*')
      .eq('hiring_request_id', id)
      .order('order_index'),
    supabase
      .from('applications')
      .select('id, hiring_request_id, stage_id, status, applied_at')
      .eq('hiring_request_id', id)
      .order('applied_at', { ascending: true }),
  ])

  if (jobRes.error) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 })
  }

  if (debug) {
    return NextResponse.json({
      job_id: id,
      stages: (stagesRes.data ?? []).map(s => ({ id: s.id, name: s.name, order_index: s.order_index })),
      apps: (appsRes.data ?? []).map(a => ({ id: a.id, stage_id: a.stage_id, status: a.status })),
      stages_error: stagesRes.error,
      apps_error: appsRes.error,
    })
  }

  // Full query with candidate join for the pipeline board
  const { data: appsWithCandidates } = await supabase
    .from('applications')
    .select('*, candidate:candidates(*)')
    .eq('hiring_request_id', id)
    .order('applied_at', { ascending: true })

  return NextResponse.json({
    data: {
      ...jobRes.data,
      pipeline_stages: stagesRes.data ?? [],
      applications: appsWithCandidates ?? [],
    },
  })
}
