'use client'

import { useCallback, useEffect, useState } from 'react'
import { useOrganization } from '@clerk/nextjs'
import Link from 'next/link'
import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  Briefcase,
  LogIn,
  Mail,
  MessageSquare,
  RefreshCw,
  UserCheck,
  Users,
} from 'lucide-react'
import type { CandidateStatus, StageColor } from '@/lib/types/database'

// ── Types ──────────────────────────────────────────────────────────────────

interface StageCount {
  stage_id:   string
  stage_name: string
  color:      StageColor
  count:      number
}

interface TopJob {
  id:               string
  position_title:   string
  department:       string | null
  ticket_number:    string | null
  status:           string
  total_candidates: number
  stage_counts:     StageCount[]
}

interface ActivityEvent {
  id:             string
  event_type:     string
  candidate_name: string
  job_title:      string
  to_stage:       string | null
  note:           string | null
  created_at:     string
}

interface StatusBreakdown {
  status: CandidateStatus
  count:  number
}

interface DashboardData {
  stats: {
    open_jobs:         number
    total_jobs:        number
    active_candidates: number
    interviewing:      number
    hired_total:       number
  }
  top_jobs:            TopJob[]
  recent_activity:     ActivityEvent[]
  candidate_breakdown: StatusBreakdown[]
}

// ── Helpers ────────────────────────────────────────────────────────────────

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1)  return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24)  return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

const STAGE_COLORS: Record<StageColor, string> = {
  slate:   'bg-slate-400',
  blue:    'bg-blue-500',
  violet:  'bg-violet-500',
  amber:   'bg-amber-400',
  emerald: 'bg-emerald-500',
  green:   'bg-green-500',
  red:     'bg-red-500',
  pink:    'bg-pink-500',
}

const EVENT_CONFIG: Record<string, { icon: React.ReactNode; color: string }> = {
  applied:        { icon: <LogIn className="h-3.5 w-3.5" />,        color: 'bg-blue-100 text-blue-600' },
  stage_moved:    { icon: <ArrowRight className="h-3.5 w-3.5" />,   color: 'bg-violet-100 text-violet-600' },
  note_added:     { icon: <MessageSquare className="h-3.5 w-3.5" />,color: 'bg-amber-100 text-amber-600' },
  status_changed: { icon: <RefreshCw className="h-3.5 w-3.5" />,    color: 'bg-slate-100 text-slate-600' },
  email_sent:     { icon: <Mail className="h-3.5 w-3.5" />,         color: 'bg-emerald-100 text-emerald-600' },
}

const STATUS_COLORS: Record<CandidateStatus, { bg: string; label: string }> = {
  active:         { bg: 'bg-blue-500',    label: 'Active' },
  interviewing:   { bg: 'bg-amber-400',   label: 'Interviewing' },
  offer_extended: { bg: 'bg-violet-500',  label: 'Offer Extended' },
  hired:          { bg: 'bg-emerald-500', label: 'Hired' },
  inactive:       { bg: 'bg-slate-300',   label: 'Inactive' },
  rejected:       { bg: 'bg-red-400',     label: 'Rejected' },
}

// ── Sub-components ─────────────────────────────────────────────────────────

function StatCard({
  label, value, icon, color, href,
}: {
  label: string
  value: number
  icon:  React.ReactNode
  color: string
  href:  string
}) {
  return (
    <Link
      href={href}
      className={`flex items-center gap-4 rounded-xl border p-4 transition-all hover:shadow-sm hover:-translate-y-0.5 ${color}`}
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/70">
        {icon}
      </div>
      <div>
        <p className="text-2xl font-bold">{value}</p>
        <p className="text-xs font-medium opacity-70">{label}</p>
      </div>
      <ArrowUpRight className="ml-auto h-4 w-4 opacity-40" />
    </Link>
  )
}

function MiniPipelineBar({
  stageCounts,
  total,
}: {
  stageCounts: StageCount[]
  total:       number
}) {
  if (total === 0) {
    return <span className="text-xs text-slate-400">No candidates</span>
  }
  return (
    <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-slate-100 gap-0.5">
      {stageCounts.map(s => {
        const pct = (s.count / total) * 100
        if (pct === 0) return null
        return (
          <div
            key={s.stage_id}
            style={{ width: `${pct}%` }}
            className={`h-full rounded-full ${STAGE_COLORS[s.color] ?? 'bg-slate-400'}`}
            title={`${s.stage_name}: ${s.count}`}
          />
        )
      })}
    </div>
  )
}

function StatusBreakdownBar({ breakdown }: { breakdown: StatusBreakdown[] }) {
  const total = breakdown.reduce((sum, b) => sum + b.count, 0)
  if (total === 0) {
    return <p className="text-sm text-slate-400">No candidate data</p>
  }
  return (
    <div className="space-y-3">
      <div className="flex h-3 w-full overflow-hidden rounded-full gap-0.5">
        {breakdown
          .filter(b => b.count > 0)
          .map(b => (
            <div
              key={b.status}
              style={{ width: `${(b.count / total) * 100}%` }}
              className={`h-full ${STATUS_COLORS[b.status].bg}`}
              title={`${STATUS_COLORS[b.status].label}: ${b.count}`}
            />
          ))}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1.5">
        {breakdown
          .filter(b => b.count > 0)
          .map(b => (
            <div key={b.status} className="flex items-center gap-1.5">
              <div className={`h-2 w-2 rounded-full ${STATUS_COLORS[b.status].bg}`} />
              <span className="text-xs text-slate-500">{STATUS_COLORS[b.status].label}</span>
              <span className="text-xs font-semibold text-slate-700">{b.count}</span>
            </div>
          ))}
      </div>
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { organization } = useOrganization()
  const [data, setData]           = useState<DashboardData | null>(null)
  const [loading, setLoading]     = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  const fetchData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true)
    else           setLoading(true)
    try {
      const res = await fetch('/api/dashboard')
      if (res.ok) {
        setData(await res.json())
        setLastUpdated(new Date())
      }
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    if (organization) fetchData()
  }, [fetchData, organization])

  // ── Loading skeleton ─────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex flex-col gap-8 p-8">
        <div className="flex items-center justify-between">
          <div>
            <div className="h-7 w-32 rounded-lg bg-slate-200 animate-pulse" />
            <div className="mt-1.5 h-4 w-56 rounded bg-slate-100 animate-pulse" />
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-20 rounded-xl border bg-slate-50 animate-pulse" />
          ))}
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="h-64 rounded-xl border bg-slate-50 animate-pulse" />
          <div className="h-64 rounded-xl border bg-slate-50 animate-pulse" />
        </div>
        <div className="h-28 rounded-xl border bg-slate-50 animate-pulse" />
      </div>
    )
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center p-16 text-slate-400 text-sm">
        Failed to load dashboard data.{' '}
        <button onClick={() => fetchData()} className="ml-2 text-blue-500 underline">
          Retry
        </button>
      </div>
    )
  }

  const { stats, top_jobs, recent_activity, candidate_breakdown } = data

  const STAT_CARDS = [
    {
      label: 'Open Jobs',
      value: stats.open_jobs,
      icon:  <Briefcase className="h-5 w-5" />,
      color: 'bg-blue-50 text-blue-600 border-blue-100',
      href:  '/jobs',
    },
    {
      label: 'Active Candidates',
      value: stats.active_candidates,
      icon:  <Users className="h-5 w-5" />,
      color: 'bg-emerald-50 text-emerald-600 border-emerald-100',
      href:  '/candidates',
    },
    {
      label: 'Interviewing',
      value: stats.interviewing,
      icon:  <Activity className="h-5 w-5" />,
      color: 'bg-amber-50 text-amber-600 border-amber-100',
      href:  '/candidates',
    },
    {
      label: 'Total Hired',
      value: stats.hired_total,
      icon:  <UserCheck className="h-5 w-5" />,
      color: 'bg-violet-50 text-violet-600 border-violet-100',
      href:  '/candidates',
    },
  ]

  return (
    <div className="flex flex-col gap-8 p-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
          <p className="mt-1 text-sm text-slate-500">Overview of your recruiting pipeline</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <button
            onClick={() => fetchData(true)}
            disabled={refreshing}
            className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 shadow-sm transition hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          {lastUpdated && (
            <span className="text-[11px] text-slate-400">
              Updated {timeAgo(lastUpdated.toISOString())}
            </span>
          )}
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {STAT_CARDS.map(card => (
          <StatCard key={card.label} {...card} />
        ))}
      </div>

      {/* Middle row — Active Jobs + Recent Activity */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Active Jobs */}
        <div className="rounded-xl border border-slate-200 bg-white">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <h2 className="text-sm font-semibold text-slate-800">Active Jobs</h2>
            <span className="text-xs text-slate-400">{stats.total_jobs} total</span>
          </div>

          {top_jobs.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm text-slate-400">
              No jobs yet.{' '}
              <Link href="/jobs" className="text-blue-500 hover:underline">
                Create one
              </Link>
            </div>
          ) : (
            <ul className="divide-y divide-slate-50">
              {top_jobs.map(job => (
                <li key={job.id}>
                  <Link
                    href={`/jobs/${job.id}`}
                    className="flex flex-col gap-2 px-5 py-3.5 transition hover:bg-slate-50"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 min-w-0">
                        {job.ticket_number && (
                          <span className="shrink-0 text-[10px] font-semibold text-slate-400 uppercase tracking-wide">
                            {job.ticket_number}
                          </span>
                        )}
                        <span className="truncate text-sm font-medium text-slate-800">
                          {job.position_title}
                        </span>
                      </div>
                      <span className="ml-3 shrink-0 text-xs text-slate-400 tabular-nums">
                        {job.total_candidates} candidate{job.total_candidates !== 1 ? 's' : ''}
                      </span>
                    </div>
                    <MiniPipelineBar
                      stageCounts={job.stage_counts}
                      total={job.total_candidates}
                    />
                  </Link>
                </li>
              ))}
            </ul>
          )}

          <div className="border-t border-slate-100 px-5 py-3">
            <Link
              href="/jobs"
              className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700"
            >
              View all jobs <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        </div>

        {/* Recent Activity */}
        <div className="rounded-xl border border-slate-200 bg-white">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <h2 className="text-sm font-semibold text-slate-800">Recent Activity</h2>
          </div>

          {recent_activity.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm text-slate-400">
              No activity yet.
            </div>
          ) : (
            <ul className="divide-y divide-slate-50">
              {recent_activity.map(event => {
                const cfg = EVENT_CONFIG[event.event_type] ?? EVENT_CONFIG.status_changed
                return (
                  <li key={event.id} className="flex items-start gap-3 px-5 py-3">
                    <div
                      className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${cfg.color}`}
                    >
                      {cfg.icon}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-slate-700 leading-snug">
                        <span className="font-medium">{event.candidate_name}</span>
                        {event.event_type === 'applied'     && ' applied for '}
                        {event.event_type === 'stage_moved' && ' moved to '}
                        {event.event_type === 'note_added'  && ' — note added on '}
                        {event.event_type === 'email_sent'  && ' — email sent for '}
                        {event.event_type === 'status_changed' && ' status changed on '}
                        {event.event_type === 'stage_moved' && event.to_stage
                          ? <><span className="font-medium">{event.to_stage}</span>{' on '}</>
                          : null}
                        <span className="font-medium">{event.job_title}</span>
                      </p>
                      {event.note && (
                        <p className="mt-0.5 truncate text-xs text-slate-400">{event.note}</p>
                      )}
                    </div>
                    <span className="shrink-0 text-[11px] text-slate-400 tabular-nums">
                      {timeAgo(event.created_at)}
                    </span>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>

      {/* Candidate Pipeline Overview */}
      <div className="rounded-xl border border-slate-200 bg-white px-5 py-4">
        <h2 className="mb-4 text-sm font-semibold text-slate-800">Candidate Pipeline Overview</h2>
        <StatusBreakdownBar breakdown={candidate_breakdown} />
      </div>
    </div>
  )
}
