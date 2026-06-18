import { NextResponse } from 'next/server'
import { withCapability } from '@/lib/api/helpers'

// GET /api/pipeline-stages?hiring_request_id=X
// Returns all pipeline stages for a given hiring request, ordered by order_index.
export const GET = withCapability('recruiting:view', async (request, _orgId, supabase) => {
  const hiringRequestId = request.nextUrl.searchParams.get('hiring_request_id')
  if (!hiringRequestId)
    return NextResponse.json({ error: 'hiring_request_id is required' }, { status: 400 })

  const { data, error } = await supabase
    .from('pipeline_stages')
    .select('id, name, color, order_index')
    .eq('hiring_request_id', hiringRequestId)
    .order('order_index', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
})
