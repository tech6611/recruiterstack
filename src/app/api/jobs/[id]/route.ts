import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireOrg } from '@/lib/auth'

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

  const [jobRes, stagesRes, appsRes] = await Promise.all([
    supabase.from('hiring_requests').select('*').eq('id', id).eq('org_id', orgId).single(),
    supabase
      .from('pipeline_stages')
      .select('*')
      .eq('hiring_request_id', id)
      .eq('org_id', orgId)
      .order('order_index'),
    supabase
      .from('applications')
      .select('*, ai_score, ai_recommendation, ai_strengths, ai_gaps, ai_criterion_scores, ai_scored_at, candidate:candidates(*)')
      .eq('hiring_request_id', id)
      .eq('org_id', orgId)
      .order('applied_at', { ascending: true }),
  ])

  if (jobRes.error) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 })
  }

  return NextResponse.json(
    {
      data: {
        ...jobRes.data,
        pipeline_stages: stagesRes.data ?? [],
        applications: appsRes.data ?? [],
      },
    },
    {
      headers: { 'Cache-Control': 'no-store' },
    },
  )
}
