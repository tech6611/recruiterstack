import { NextResponse } from 'next/server'
import { withCapability } from '@/lib/api/helpers'

// GET /api/pipeline-stages?job_id=X  (canonical)  |  ?hiring_request_id=X (legacy)
// Returns all pipeline stages for a given job, ordered by order_index.
export const GET = withCapability('recruiting:view', async (request, _orgId, supabase) => {
  const jobId = request.nextUrl.searchParams.get('job_id')
  const hiringRequestId = request.nextUrl.searchParams.get('hiring_request_id')
  if (!jobId && !hiringRequestId)
    return NextResponse.json({ error: 'job_id or hiring_request_id is required' }, { status: 400 })

  const query = supabase
    .from('pipeline_stages')
    .select('id, name, color, order_index')
    .order('order_index', { ascending: true })

  const { data, error } = await (jobId
    ? query.eq('job_id', jobId)
    : query.eq('hiring_request_id', hiringRequestId as string)
  )

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
})
