import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import type { HiringRequest, PipelineStage, StageColor } from '@/lib/types/database'

// GET /api/jobs — list all hiring requests with candidate counts per stage
export async function GET() {
  const supabase = createAdminClient()

  const [jobsRes, stagesRes, appsRes] = await Promise.all([
    supabase
      .from('hiring_requests')
      .select('*')
      .order('created_at', { ascending: false }),
    supabase
      .from('pipeline_stages')
      .select('*')
      .order('order_index'),
    supabase
      .from('applications')
      .select('id, hiring_request_id, stage_id, status'),
  ])

  if (jobsRes.error) {
    return NextResponse.json({ error: jobsRes.error.message }, { status: 500 })
  }

  const jobs = (jobsRes.data ?? []) as HiringRequest[]
  const stages = (stagesRes.data ?? []) as PipelineStage[]
  const apps = appsRes.data ?? []

  // Build per-job stage counts
  const data = jobs.map(job => {
    const jobStages = stages.filter(s => s.hiring_request_id === job.id)
    const jobApps = apps.filter(a => a.hiring_request_id === job.id && a.status === 'active')
    const total = apps.filter(a => a.hiring_request_id === job.id).length

    const stage_counts = jobStages.map(s => ({
      stage_id: s.id,
      stage_name: s.name,
      color: s.color as StageColor,
      count: jobApps.filter(a => a.stage_id === s.id).length,
    }))

    return {
      ...job,
      total_candidates: total,
      stage_counts,
    }
  })

  return NextResponse.json({ data })
}
