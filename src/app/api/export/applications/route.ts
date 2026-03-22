import { NextRequest, NextResponse } from 'next/server'
import { requireOrg } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'
import { toCsvResponse } from '@/lib/api/csv'

const CSV_HEADERS = [
  'Candidate Name', 'Candidate Email', 'Job Title', 'Department',
  'Stage', 'Status', 'Source', 'AI Score', 'Applied At',
]

// GET /api/export/applications?job_id=xxx&status=active
export async function GET(req: NextRequest) {
  const authResult = await requireOrg()
  if (authResult instanceof NextResponse) return authResult
  const { orgId } = authResult

  const supabase = createAdminClient()
  const { searchParams } = new URL(req.url)
  const jobId = searchParams.get('job_id')
  const status = searchParams.get('status')

  let query = supabase
    .from('applications')
    .select(`
      status, source, ai_score, applied_at,
      candidates(name, email),
      hiring_requests(position_title, department),
      pipeline_stages(name)
    `)
    .eq('org_id', orgId)
    .order('applied_at', { ascending: false })

  if (jobId) query = query.eq('hiring_request_id', jobId)
  if (status) query = query.eq('status', status)

  const { data, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (data ?? []).map((a: any) => [
    a.candidates?.name ?? '',
    a.candidates?.email ?? '',
    a.hiring_requests?.position_title ?? '',
    a.hiring_requests?.department ?? '',
    a.pipeline_stages?.name ?? '',
    a.status,
    a.source ?? '',
    a.ai_score ?? '',
    a.applied_at,
  ])

  const date = new Date().toISOString().slice(0, 10)
  return toCsvResponse(`applications-${date}.csv`, CSV_HEADERS, rows)
}
