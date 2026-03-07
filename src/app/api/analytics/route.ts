import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

// GET /api/analytics — pipeline funnel, source breakdown, time-in-stage
export async function GET() {
  const supabase = createAdminClient()

  const [jobsRes, appsRes, stagesRes, candsRes] = await Promise.all([
    supabase
      .from('hiring_requests')
      .select('id, position_title, department, status')
      .order('created_at', { ascending: false }),
    supabase
      .from('applications')
      .select('id, status, source, stage_id, applied_at, hiring_request_id, candidate_id'),
    supabase
      .from('pipeline_stages')
      .select('id, name, color, order_index, hiring_request_id')
      .order('order_index'),
    supabase
      .from('candidates')
      .select('id, status'),
  ])

  const jobs   = jobsRes.data   ?? []
  const apps   = appsRes.data   ?? []
  const stages = stagesRes.data ?? []
  const cands  = candsRes.data  ?? []

  // ── 1. Jobs funnel ────────────────────────────────────────────────────────
  const ACTIVE_JOB_STATUSES = ['active', 'jd_approved', 'jd_sent', 'jd_generated', 'posted']
  const activeJobs = jobs.filter(j => ACTIVE_JOB_STATUSES.includes(j.status))

  const jobsFunnel = activeJobs
    .map(job => {
      const jobStages = stages.filter(s => s.hiring_request_id === job.id)
      const activeApps = apps.filter(a => a.hiring_request_id === job.id && a.status === 'active')
      return {
        id:         job.id,
        title:      job.position_title,
        department: job.department,
        total:      activeApps.length,
        stages: jobStages.map(s => ({
          id:    s.id,
          name:  s.name,
          color: s.color,
          count: activeApps.filter(a => a.stage_id === s.id).length,
        })),
      }
    })
    .filter(j => j.total > 0)
    .sort((a, b) => b.total - a.total)

  // ── 2. Source breakdown ───────────────────────────────────────────────────
  const sourceMap: Record<string, number> = {}
  apps.forEach(a => {
    sourceMap[a.source] = (sourceMap[a.source] ?? 0) + 1
  })
  const sourceBreakdown = Object.entries(sourceMap)
    .map(([source, count]) => ({ source, count }))
    .sort((a, b) => b.count - a.count)

  // ── 3. Avg days in pipeline per current stage name ────────────────────────
  const STAGE_ORDER = ['Applied', 'Screening', 'Phone Screen', 'Interview', 'Offer', 'Hired']
  const velocityMap: Record<string, { total: number; count: number }> = {}
  const now = Date.now()

  apps
    .filter(a => a.status === 'active' && a.stage_id)
    .forEach(a => {
      const stage = stages.find(s => s.id === a.stage_id)
      if (!stage) return
      const days = Math.floor((now - new Date(a.applied_at).getTime()) / 86400000)
      if (!velocityMap[stage.name]) velocityMap[stage.name] = { total: 0, count: 0 }
      velocityMap[stage.name].total += days
      velocityMap[stage.name].count += 1
    })

  const avgTimePerStage = Object.entries(velocityMap)
    .map(([name, { total, count }]) => ({ name, avgDays: Math.round(total / count), count }))
    .sort((a, b) => {
      const ai = STAGE_ORDER.indexOf(a.name)
      const bi = STAGE_ORDER.indexOf(b.name)
      if (ai >= 0 && bi >= 0) return ai - bi
      if (ai >= 0) return -1
      if (bi >= 0) return 1
      return 0
    })

  // ── 4. Summary stats ──────────────────────────────────────────────────────
  const interviewingCount = apps.filter(a => {
    if (a.status !== 'active' || !a.stage_id) return false
    const stage = stages.find(s => s.id === a.stage_id)
    return stage?.name?.toLowerCase().includes('interview')
  }).length

  // Distinct candidates with at least one active application (in pipeline)
  const inPipelineCandidateIds = new Set(
    apps.filter(a => a.status === 'active').map(a => a.candidate_id)
  )

  const stats = {
    active_candidates:  cands.filter(c => c.status === 'active').length,
    in_pipeline:        inPipelineCandidateIds.size,
    total_hired:        apps.filter(a => a.status === 'hired').length,
    total_rejected:     apps.filter(a => a.status === 'rejected').length,
    interviewing:       interviewingCount,
    total_applications: apps.length,
    active_jobs:        activeJobs.length,
  }

  return NextResponse.json({
    data: { stats, jobs_funnel: jobsFunnel, source_breakdown: sourceBreakdown, avg_time_per_stage: avgTimePerStage },
  })
}
