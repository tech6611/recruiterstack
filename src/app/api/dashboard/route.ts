import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getOrgId } from '@/lib/auth'
import { cached, cacheKey } from '@/lib/api/cache'
import { checkAuthRateLimit } from '@/lib/api/rate-limit'
import type { CandidateStatus, StageColor } from '@/lib/types/database'

const INTERVIEW_KEYWORDS = ['interview', 'screen', 'technical', 'phone', 'video', 'onsite', 'call']

export async function GET() {
  const orgId = await getOrgId()

  if (orgId) {
    const rateLimited = await checkAuthRateLimit(orgId)
    if (rateLimited) return rateLimited
  }

  const ALL_STATUSES: CandidateStatus[] = [
    'active', 'interviewing', 'offer_extended', 'hired', 'inactive', 'rejected',
  ]

  if (!orgId) {
    return NextResponse.json({
      stats: {
        open_jobs: 0, total_jobs: 0, active_candidates: 0,
        interviewing: 0, hired_total: 0, pending_offers: 0,
        interviews_to_schedule: 0, overdue_followups_count: 0,
      },
      top_jobs:            [],
      recent_activity:     [],
      candidate_breakdown: ALL_STATUSES.map(status => ({ status, count: 0 })),
      upcoming_interviews: [],
      tasks:               { pending_approvals: [], feedback_needed: [], overdue_followups: [] },
      application_review:  [],
    })
  }

  const dashboardData = await cached(cacheKey(orgId, 'dashboard'), 60, async () => {
  const supabase = createAdminClient()

  const [jobsRes, stagesRes, appsRes, candidatesRes, eventsRes] = await Promise.all([
    supabase
      .from('hiring_requests')
      .select('*')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false }),

    supabase
      .from('pipeline_stages')
      .select('*')
      .eq('org_id', orgId)
      .order('order_index'),

    supabase
      .from('applications')
      .select('id, candidate_id, hiring_request_id, stage_id, status, applied_at, ai_score, ai_recommendation, source')
      .eq('org_id', orgId),

    supabase
      .from('candidates')
      .select('id, name, status, current_title')
      .eq('org_id', orgId),

    // Increased limit + include application_id for task derivation; keep joins for activity feed
    supabase
      .from('application_events')
      .select(`
        id, application_id, event_type, to_stage, note, created_at,
        applications (
          candidates ( name ),
          hiring_requests ( position_title )
        )
      `)
      .eq('org_id', orgId)
      .order('created_at', { ascending: false })
      .limit(100),
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

  // ── Lookup maps ─────────────────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const stageMap     = new Map(stages.map((s: any)     => [s.id, s]))
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const candidateMap = new Map(candidates.map((c: any) => [c.id, c]))
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const jobMap       = new Map(jobs.map((j: any)       => [j.id, j]))

  // Most recent event per application (events are DESC by created_at)
  const lastEventByApp = new Map<string, { event_type: string; created_at: string }>()
  for (const e of events) {
    if (e.application_id && !lastEventByApp.has(e.application_id)) {
      lastEventByApp.set(e.application_id, { event_type: e.event_type, created_at: e.created_at })
    }
  }

  // ── Stats ────────────────────────────────────────────────────────────────────
  const open_jobs         = jobs.filter(j => j.status === 'posted').length
  const total_jobs        = jobs.length
  const active_candidates = candidates.filter(c => c.status === 'active').length
  const interviewing      = candidates.filter(c => c.status === 'interviewing').length
  const hired_total       = candidates.filter(c => c.status === 'hired').length
  const pending_offers    = candidates.filter(c => c.status === 'offer_extended').length

  // ── Upcoming interviews ──────────────────────────────────────────────────────
  // Applications whose current stage name contains an interview keyword
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const interviewApps = apps.filter((a: any) => {
    if (!a.stage_id || a.status !== 'active') return false
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stage = stageMap.get(a.stage_id) as any
    if (!stage) return false
    const name = (stage.name as string).toLowerCase()
    return INTERVIEW_KEYWORDS.some(kw => name.includes(kw))
  })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const upcoming_interviews = interviewApps.slice(0, 15).map((a: any) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const candidate = candidateMap.get(a.candidate_id) as any
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const job       = jobMap.get(a.hiring_request_id) as any
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stage     = stageMap.get(a.stage_id) as any
    const lastEvt   = lastEventByApp.get(a.id)
    return {
      id:             a.id,
      candidate_id:   a.candidate_id,
      candidate_name: candidate?.name           ?? 'Unknown',
      job_id:         a.hiring_request_id,
      job_title:      job?.position_title       ?? 'Unknown',
      stage_name:     stage?.name               ?? 'Interview',
      moved_at:       lastEvt?.created_at       ?? a.applied_at,
    }
  })

  // ── Interviews to schedule (first-stage active apps) ─────────────────────────
  const firstStageIds = new Set(
    stages
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .filter((s: any) => s.order_index === 0)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((s: any) => s.id)
  )
  const interviews_to_schedule = apps.filter(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (a: any) => a.status === 'active' && a.stage_id && firstStageIds.has(a.stage_id)
  ).length

  // ── Tasks — Pending approvals (JDs ready to post) ───────────────────────────
  const pending_approvals = jobs
    .filter(j => j.status === 'jd_approved')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((j: any) => ({
      id:         j.id,
      title:      j.position_title,
      department: j.department  ?? null,
      location:   j.location    ?? null,
      status:     j.status,
      created_at: j.created_at,
    }))

  // ── Tasks — Feedback needed (interview-stage apps) ───────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const feedback_needed = interviewApps.slice(0, 15).map((a: any) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const candidate = candidateMap.get(a.candidate_id) as any
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const job       = jobMap.get(a.hiring_request_id) as any
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stage     = stageMap.get(a.stage_id) as any
    const lastEvt   = lastEventByApp.get(a.id)
    return {
      id:             a.id,
      candidate_id:   a.candidate_id,
      candidate_name: candidate?.name     ?? 'Unknown',
      job_title:      job?.position_title ?? 'Unknown',
      stage_name:     stage?.name         ?? 'Interview',
      moved_at:       lastEvt?.created_at ?? a.applied_at,
    }
  })

  // ── Tasks — Overdue followups (active apps with no activity in 14+ days) ─────
  const FOURTEEN_DAYS_AGO = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const overdue_followups = apps.filter((a: any) => {
    if (a.status !== 'active') return false
    const lastEvt = lastEventByApp.get(a.id)
    if (!lastEvt) return a.applied_at < FOURTEEN_DAYS_AGO
    return lastEvt.created_at < FOURTEEN_DAYS_AGO
  })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  .slice(0, 15).map((a: any) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const candidate = candidateMap.get(a.candidate_id) as any
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const job       = jobMap.get(a.hiring_request_id) as any
    const lastEvt   = lastEventByApp.get(a.id)
    return {
      id:             a.id,
      candidate_id:   a.candidate_id,
      candidate_name: candidate?.name     ?? 'Unknown',
      job_title:      job?.position_title ?? 'Unknown',
      last_event_at:  lastEvt?.created_at ?? a.applied_at,
      app_status:     a.status as string,
    }
  })

  const overdue_followups_count = overdue_followups.length

  // ── Recent applications (sorted by applied_at desc) ──────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recent_applications = [...apps]
    .sort((a, b) => new Date((b as any).applied_at).getTime() - new Date((a as any).applied_at).getTime())
    .slice(0, 15)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((a: any) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const candidate = candidateMap.get(a.candidate_id) as any
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const job       = jobMap.get(a.hiring_request_id) as any
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const stage     = stageMap.get(a.stage_id) as any
      return {
        id:             a.id,
        candidate_id:   a.candidate_id,
        candidate_name: candidate?.name         ?? 'Unknown',
        job_title:      job?.position_title     ?? 'Unknown',
        stage_name:     stage?.name             ?? null,
        applied_at:     a.applied_at,
        source:         a.source                ?? 'manual',
        ai_score:       a.ai_score              ?? null,
      }
    })

  // ── Top AI-scored candidates ──────────────────────────────────────────────────
  const top_scored = apps
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .filter((a: any) => a.ai_score !== null && a.ai_score !== undefined)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .sort((a: any, b: any) => (b.ai_score as number) - (a.ai_score as number))
    .slice(0, 10)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((a: any) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const candidate = candidateMap.get(a.candidate_id) as any
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const job       = jobMap.get(a.hiring_request_id) as any
      return {
        id:                a.id,
        candidate_id:      a.candidate_id,
        candidate_name:    candidate?.name         ?? 'Unknown',
        job_title:         job?.position_title     ?? 'Unknown',
        ai_score:          a.ai_score as number,
        ai_recommendation: (a.ai_recommendation   ?? null) as string | null,
      }
    })

  // ── Candidate sources ─────────────────────────────────────────────────────────
  const sourceCounts = new Map<string, number>()
  for (const a of apps) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const src = (a as any).source ?? 'manual'
    sourceCounts.set(src, (sourceCounts.get(src) ?? 0) + 1)
  }
  const candidate_sources = Array.from(sourceCounts.entries())
    .map(([source, count]) => ({ source, count }))
    .sort((a, b) => b.count - a.count)

  // ── Offer tracker ─────────────────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const offer_tracker = candidates
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .filter((c: any) => c.status === 'offer_extended')
    .slice(0, 10)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((c: any) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const app = apps.find((a: any) => a.candidate_id === c.id && a.status === 'active')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const job = app ? (jobMap.get((app as any).hiring_request_id) as any) : null
      return {
        candidate_id:   c.id,
        candidate_name: c.name,
        current_title:  c.current_title ?? null,
        job_title:      job?.position_title ?? 'Unknown',
      }
    })

  // ── Jobs by department ────────────────────────────────────────────────────────
  const deptMap = new Map<string, { job_count: number; candidate_count: number }>()
  for (const j of jobs) {
    const dept    = j.department ?? 'No Department'
    const existing = deptMap.get(dept) ?? { job_count: 0, candidate_count: 0 }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const jobApps  = apps.filter((a: any) => a.hiring_request_id === j.id).length
    deptMap.set(dept, { job_count: existing.job_count + 1, candidate_count: existing.candidate_count + jobApps })
  }
  const jobs_by_dept = Array.from(deptMap.entries())
    .map(([department, { job_count, candidate_count }]) => ({ department, job_count, candidate_count }))
    .sort((a, b) => b.candidate_count - a.candidate_count)
    .slice(0, 8)

  // ── Stage funnel (active candidates per stage, cross-job) ────────────────────
  const stageFunnelMap = new Map<string, { stage_name: string; color: string; count: number }>()
  for (const a of apps) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((a as any).status !== 'active' || !(a as any).stage_id) continue
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stage = stageMap.get((a as any).stage_id) as any
    if (!stage) continue
    const entry = stageFunnelMap.get(stage.id)
    if (entry) entry.count++
    else stageFunnelMap.set(stage.id, { stage_name: stage.name, color: stage.color, count: 1 })
  }
  const stage_funnel = Array.from(stageFunnelMap.entries())
    .map(([stage_id, { stage_name, color, count }]) => ({
      stage_id, stage_name, color: color as StageColor, count,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)

  // ── Application review (posted jobs with first-stage apps) ──────────────────
  const application_review = jobs
    .filter(j => j.status === 'posted')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((j: any) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const firstStage = stages.find((s: any) => s.hiring_request_id === j.id && s.order_index === 0)
      if (!firstStage) return null
      const count = apps.filter(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (a: any) => a.hiring_request_id === j.id && a.stage_id === firstStage.id && a.status === 'active'
      ).length
      if (count === 0) return null
      return {
        job_id:     j.id,
        job_title:  j.position_title,
        department: j.department ?? null,
        location:   j.location   ?? null,
        count,
      }
    })
    .filter(Boolean)
    .slice(0, 6)

  // ── Top jobs ──────────────────────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const top_jobs = jobs.slice(0, 6).map((job: any) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const jobStages  = stages.filter((s: any) => s.hiring_request_id === job.id)
    const activeApps = apps.filter((a: { hiring_request_id: string; status: string }) => a.hiring_request_id === job.id && a.status === 'active')
    const total      = apps.filter((a: { hiring_request_id: string }) => a.hiring_request_id === job.id).length
    return {
      id:               job.id,
      position_title:   job.position_title,
      department:       job.department   ?? null,
      location:         job.location     ?? null,
      ticket_number:    job.ticket_number ?? null,
      status:           job.status,
      total_candidates: total,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      stage_counts:     jobStages.map((s: any) => ({
        stage_id:   s.id,
        stage_name: s.name,
        color:      s.color as StageColor,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        count:      activeApps.filter((a: any) => a.stage_id === s.id).length,
      })),
    }
  })

  // ── Recent activity (first 10 events with joins) ─────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recent_activity = events.slice(0, 10).map((e: any) => ({
    id:             e.id,
    event_type:     e.event_type,
    candidate_name: e.applications?.candidates?.name                ?? 'Unknown',
    job_title:      e.applications?.hiring_requests?.position_title ?? 'Unknown',
    to_stage:       e.to_stage,
    note:           e.note,
    created_at:     e.created_at,
  }))

  // ── Candidate status breakdown ────────────────────────────────────────────────
  const statusCounts = new Map<string, number>()
  for (const c of candidates) {
    statusCounts.set(c.status, (statusCounts.get(c.status) ?? 0) + 1)
  }
  const candidate_breakdown = ALL_STATUSES.map(status => ({
    status,
    count: statusCounts.get(status) ?? 0,
  }))

  return {
    stats: {
      open_jobs, total_jobs, active_candidates, interviewing, hired_total,
      pending_offers, interviews_to_schedule, overdue_followups_count,
    },
    top_jobs,
    recent_activity,
    candidate_breakdown,
    upcoming_interviews,
    tasks: { pending_approvals, feedback_needed, overdue_followups },
    application_review,
    recent_applications,
    top_scored,
    candidate_sources,
    offer_tracker,
    jobs_by_dept,
    stage_funnel,
  }
  }) // end cached()

  return NextResponse.json(dashboardData)
}
