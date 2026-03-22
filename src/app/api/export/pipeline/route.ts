import { NextResponse } from 'next/server'
import { requireOrg } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'
import { toCsvResponse } from '@/lib/api/csv'

const CSV_HEADERS = [
  'Job Title', 'Department', 'Stage Name', 'Stage Order',
  'Active Count', 'Total Count',
]

// GET /api/export/pipeline
export async function GET() {
  const authResult = await requireOrg()
  if (authResult instanceof NextResponse) return authResult
  const { orgId } = authResult

  const supabase = createAdminClient()

  const [jobsRes, stagesRes, appsRes] = await Promise.all([
    supabase
      .from('hiring_requests')
      .select('id, position_title, department')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false }),
    supabase
      .from('pipeline_stages')
      .select('id, hiring_request_id, name, order_index')
      .eq('org_id', orgId)
      .order('order_index'),
    supabase
      .from('applications')
      .select('hiring_request_id, stage_id, status')
      .eq('org_id', orgId),
  ])

  const jobs = jobsRes.data ?? []
  const stages = stagesRes.data ?? []
  const apps = appsRes.data ?? []

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows: unknown[][] = []

  for (const job of jobs) {
    const jobStages = stages
      .filter(s => s.hiring_request_id === job.id)
      .sort((a, b) => a.order_index - b.order_index)

    for (const stage of jobStages) {
      const activeCount = apps.filter(
        a => a.hiring_request_id === job.id && a.stage_id === stage.id && a.status === 'active'
      ).length
      const totalCount = apps.filter(
        a => a.hiring_request_id === job.id && a.stage_id === stage.id
      ).length

      rows.push([
        job.position_title,
        job.department ?? '',
        stage.name,
        stage.order_index,
        activeCount,
        totalCount,
      ])
    }
  }

  const date = new Date().toISOString().slice(0, 10)
  return toCsvResponse(`pipeline-${date}.csv`, CSV_HEADERS, rows)
}
