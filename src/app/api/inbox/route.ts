import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getOrgId } from '@/lib/auth'

// GET /api/inbox — recent activity feed + needs-attention queue
export async function GET() {
  const orgId = await getOrgId()
  if (!orgId) {
    return NextResponse.json({ data: { activity: [], needs_attention: [] } })
  }

  const supabase = createAdminClient()

  const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString()

  const [eventsRes, staleRes] = await Promise.all([
    // Recent 50 events with application → candidate + job context
    supabase
      .from('application_events')
      .select(`
        id, event_type, from_stage, to_stage, note, created_by, created_at,
        application:applications(
          id, status,
          candidate:candidates(id, full_name, email),
          job:hiring_requests(id, position_title, department)
        )
      `)
      .eq('org_id', orgId)
      .order('created_at', { ascending: false })
      .limit(50),

    // Active applications stale for 14+ days (no stage move)
    supabase
      .from('applications')
      .select(`
        id, status, applied_at, stage_id,
        candidate:candidates(id, full_name, email),
        job:hiring_requests(id, position_title, department),
        stage:pipeline_stages(name, color)
      `)
      .eq('org_id', orgId)
      .eq('status', 'active')
      .lt('applied_at', fourteenDaysAgo)
      .order('applied_at', { ascending: true })
      .limit(50),
  ])

  return NextResponse.json({
    data: {
      activity:        eventsRes.data  ?? [],
      needs_attention: staleRes.data   ?? [],
    },
  })
}
