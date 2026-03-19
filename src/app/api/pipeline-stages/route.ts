import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireOrg } from '@/lib/auth'

// GET /api/pipeline-stages?hiring_request_id=X
// Returns all pipeline stages for a given hiring request, ordered by order_index.
export async function GET(request: NextRequest) {
  const authResult = await requireOrg()
  if (authResult instanceof NextResponse) return authResult

  const hiringRequestId = request.nextUrl.searchParams.get('hiring_request_id')
  if (!hiringRequestId)
    return NextResponse.json({ error: 'hiring_request_id is required' }, { status: 400 })

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('pipeline_stages')
    .select('id, name, color, order_index')
    .eq('hiring_request_id', hiringRequestId)
    .order('order_index', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}
