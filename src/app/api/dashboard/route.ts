import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireOrg } from '@/lib/auth'
import type { CandidateStatus, StageColor } from '@/lib/types/database'

export async function GET() {
  const authResult = requireOrg()
  if (authResult instanceof NextResponse) return authResult
  const { orgId } = authResult

  const supabase = createAdminClient()

  const [jobsRes, stagesRes, appsRes, candidatesRes, eventsRes] = await Promise.all([
    supabase.from('hiring_requests').select('*').eq('org_id', orgId).order('created_at', { ascending: false }),
    supabase.from('pipeline_stages').select('*').eq('org_id', orgId).order('order_index'),
    supabase.from('applications').select('id, hiring_request_id, stage_id, status, candidate_id').eq('org_id', orgId),
    supabase.from('candidates').select('id, name, status').eq('org_id', orgId),
    supabase
      .from('application_events')
      .select(`
        id, event_type, to_stage, note, created_at,
        applications (
          candidates ( name ),
          hiring_requests ( position_title )
        )
      `)
      .eq('org_id', orgId)
      .order('created_at', { ascending: false })
      .limit(10),
  ])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const jobs       = (jobsRes.data       ?? []) as any[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const stages     = (stagesRes.data     ?? []) as any[]
  const apps       = appsRes.data        ?? []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const candidates = (candidatesRes.data ?? []) as any[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const events     = (eventsRes.data     ?? []) as any[]

  // ── Stats ──────────────────────────────────────────────────────────────────
  const open_jobs         = jobs.filter(j => j.status === 'posted').length
  const total_jobs        = jobs.length
  const active_candidates = candidates.filter(c => c.status === 'active').length
  const interviewing      = candidates.filter(c => c.status === 'interviewing').length
  const hired_total       = candidates.filter(c => c.status === 'hired').length

  // ── Top 5 most-recent jobs with per-stage counts ───────────────────────────
  const top_jobs = jobs.slice(0, 5).map((job: any) => {
    const jobStages  = stages.filter((s: any) => s.hiring_request_id === job.id)
    const activeApps = apps.filter(a => a.hiring_request_id === job.id && a.status === 'active')
    const total      = apps.filter(a => a.hiring_request_id === job.id).length

    return {
      id:               job.id,
      position_title:   job.position_title,
      department:       job.department,
      ticket_number:    job.ticket_number,
      status:           job.status,
      total_candidates: total,
      stage_counts:     jobStages.map((s: any) => ({
        stage_id:   s.id,
        stage_name: s.name,
        color:      s.color as StageColor,
        count:      activeApps.filter((a: any) => a.stage_id === s.id).length,
      })),
    }
  })

  // ── Recent activity (last 10 events) ──────────────────────────────────────
  const recent_activity = events.map((e: any) => ({
    id:             e.id,
    event_type:     e.event_type,
    candidate_name: e.applications?.candidates?.name                ?? 'Unknown',
    job_title:      e.applications?.hiring_requests?.position_title ?? 'Unknown',
    to_stage:       e.to_stage,
    note:           e.note,
    created_at:     e.created_at,
  }))

  // ── Candidate status breakdown ─────────────────────────────────────────────
  const statusCounts = new Map<string, number>()
  for (const c of candidates) {
    statusCounts.set(c.status, (statusCounts.get(c.status) ?? 0) + 1)
  }

  const ALL_STATUSES: CandidateStatus[] = [
    'active', 'interviewing', 'offer_extended', 'hired', 'inactive', 'rejected',
  ]
  const candidate_breakdown = ALL_STATUSES.map(status => ({
    status,
    count: statusCounts.get(status) ?? 0,
  }))

  return NextResponse.json({
    stats: { open_jobs, total_jobs, active_candidates, interviewing, hired_total },
    top_jobs,
    recent_activity,
    candidate_breakdown,
  })
}
