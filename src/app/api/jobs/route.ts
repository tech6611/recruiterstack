import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireOrg } from '@/lib/auth'
import type { StageColor } from '@/lib/types/database'

// GET /api/jobs — list all hiring requests with candidate counts per stage
export async function GET() {
  const authResult = await requireOrg()
  if (authResult instanceof NextResponse) return authResult
  const { orgId } = authResult

  const supabase = createAdminClient()

  const [jobsRes, stagesRes, appsRes] = await Promise.all([
    supabase
      .from('hiring_requests')
      .select('*')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false }),
    supabase
      .from('pipeline_stages')
      .select('id, hiring_request_id, name, color, order_index')
      .eq('org_id', orgId),
    supabase
      .from('applications')
      .select('id, hiring_request_id, stage_id, status')
      .eq('org_id', orgId),
  ])

  if (jobsRes.error) {
    return NextResponse.json({ error: jobsRes.error.message }, { status: 500 })
  }

  const stages = stagesRes.data ?? []
  const apps = appsRes.data ?? []

  const data = (jobsRes.data ?? []).map(job => {
    const jobStages = stages
      .filter(s => s.hiring_request_id === job.id)
      .sort((a, b) => a.order_index - b.order_index)
    const jobApps = apps.filter(
      a => a.hiring_request_id === job.id && a.status === 'active'
    )

    const stage_counts = jobStages.map(s => ({
      stage_id: s.id,
      stage_name: s.name,
      color: s.color as StageColor,
      count: jobApps.filter(a => a.stage_id === s.id).length,
    }))

    return {
      ...job,
      total_candidates: apps.filter(a => a.hiring_request_id === job.id).length,
      stage_counts,
    }
  })

  return NextResponse.json({ data })
}
