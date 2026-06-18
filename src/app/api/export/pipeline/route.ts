import { NextResponse } from 'next/server'
import { requireOrgAndUser } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'
import { getViewerScope, assertCapability } from '@/lib/rbac'
import { toCsvResponse } from '@/lib/api/csv'
import { fetchLegacyPipelineExportInputs } from '@/modules/ats/domain/reporting'

const CSV_HEADERS = [
  'Job Title', 'Department', 'Stage Name', 'Stage Order',
  'Active Count', 'Total Count',
]

// GET /api/export/pipeline
export async function GET() {
  const authResult = await requireOrgAndUser()
  if (authResult instanceof NextResponse) return authResult
  const { orgId, userId } = authResult

  const supabase = createAdminClient()
  const scope = await getViewerScope(supabase, orgId, userId)
  const denied = assertCapability(scope, 'recruiting:view')
  if (denied) return denied

  const inputs = await fetchLegacyPipelineExportInputs(supabase, orgId)

  const jobs = inputs.jobs as { id: string; position_title: string; department: string | null }[]
  const stages = inputs.stages as { id: string; hiring_request_id: string; name: string; order_index: number }[]
  const apps = inputs.apps as { hiring_request_id: string; stage_id: string | null; status: string }[]

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
