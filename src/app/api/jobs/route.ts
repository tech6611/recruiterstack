import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import type { StageColor } from '@/lib/types/database'

// GET /api/jobs — list all hiring requests with candidate counts per stage
export async function GET() {
  const supabase = createAdminClient()

  // Use a single joined query so stage/application data is always consistent
  // for each job (no cross-job contamination from global JS filtering).
  const { data, error } = await supabase
    .from('hiring_requests')
    .select(`
      *,
      pipeline_stages(*),
      applications(id, stage_id, status)
    `)
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const jobs = (data ?? []).map(job => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stages = ((job as any).pipeline_stages ?? []) as {
      id: string; name: string; color: string; order_index: number
    }[]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const apps = ((job as any).applications ?? []) as {
      id: string; stage_id: string | null; status: string
    }[]

    const activeApps = apps.filter(a => a.status === 'active')
    const sortedStages = [...stages].sort((a, b) => a.order_index - b.order_index)

    const stage_counts = sortedStages.map(s => ({
      stage_id: s.id,
      stage_name: s.name,
      color: s.color as StageColor,
      count: activeApps.filter(a => a.stage_id === s.id).length,
    }))

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { pipeline_stages: _ps, applications: _apps, ...jobFields } = job as any

    return {
      ...jobFields,
      total_candidates: apps.length,
      stage_counts,
    }
  })

  return NextResponse.json({ data: jobs })
}
