'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@clerk/nextjs'
import { RefreshCw, TrendingUp, Users, CheckCircle, XCircle, Briefcase, Clock } from 'lucide-react'
import type { StageColor } from '@/lib/types/database'

// ── Types ─────────────────────────────────────────────────────────────────────

interface AnalyticsData {
  stats: {
    active_candidates:  number
    in_pipeline:        number
    total_hired:        number
    total_rejected:     number
    interviewing:       number
    total_applications: number
    active_jobs:        number
  }
  jobs_funnel: {
    id:         string
    title:      string
    department: string | null
    total:      number
    stages: { id: string; name: string; color: StageColor; count: number }[]
  }[]
  source_breakdown: { source: string; count: number }[]
  avg_time_per_stage: { name: string; avgDays: number; count: number }[]
}

// ── Colour maps ───────────────────────────────────────────────────────────────

const STAGE_BAR: Record<StageColor, string> = {
  slate:   'bg-slate-400',
  blue:    'bg-blue-500',
  violet:  'bg-violet-500',
  amber:   'bg-amber-500',
  emerald: 'bg-emerald-500',
  green:   'bg-green-500',
  red:     'bg-red-500',
  pink:    'bg-pink-500',
}

const STAGE_TEXT: Record<StageColor, string> = {
  slate:   'text-slate-600',
  blue:    'text-blue-600',
  violet:  'text-violet-600',
  amber:   'text-amber-600',
  emerald: 'text-emerald-600',
  green:   'text-green-600',
  red:     'text-red-600',
  pink:    'text-pink-600',
}

const SOURCE_COLORS: Record<string, string> = {
  manual:   'bg-slate-500',
  applied:  'bg-blue-500',
  sourced:  'bg-amber-500',
  referral: 'bg-emerald-500',
  imported: 'bg-violet-500',
}

const SOURCE_LABELS: Record<string, string> = {
  manual:   'Manually Added',
  applied:  'Applied (Public)',
  sourced:  'Sourced',
  referral: 'Referral',
  imported: 'Imported',
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function pct(val: number, total: number) {
  if (!total) return 0
  return Math.round((val / total) * 100)
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  return `${Math.floor(m / 60)}h ago`
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatCard({
  label, value, sub, icon: Icon, color,
}: {
  label: string; value: number | string; sub?: string
  icon: React.ElementType; color: string
}) {
  return (
    <div className="rounded-2xl bg-white border border-slate-200 px-5 py-4 flex items-center gap-4">
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${color}`}>
        <Icon className="h-5 w-5 text-white" />
      </div>
      <div>
        <p className="text-2xl font-bold text-slate-900 leading-tight">{value}</p>
        <p className="text-xs font-medium text-slate-500">{label}</p>
        {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function AnalyticsPage() {
  const { orgId } = useAuth()
  const [data, setData]           = useState<AnalyticsData | null>(null)
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState('')
  const [updatedAt, setUpdatedAt] = useState('')

  const load = useCallback(async () => {
    setLoading(true); setError('')
    const res = await fetch('/api/analytics')
    if (!res.ok) { setError('Failed to load analytics'); setLoading(false); return }
    const json = await res.json()
    setData(json.data)
    setUpdatedAt(new Date().toISOString())
    setLoading(false)
  }, [])

  useEffect(() => { if (orgId) load() }, [load, orgId])

  if (loading) {
    return (
      <div className="flex flex-col gap-6 px-8 py-8">
        {/* Header skeleton */}
        <div className="h-8 w-48 rounded-xl bg-slate-200 animate-pulse" />
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-20 rounded-2xl bg-slate-200 animate-pulse" />
          ))}
        </div>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-64 rounded-2xl bg-slate-200 animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3 text-slate-400">
        <TrendingUp className="h-8 w-8" />
        <p className="text-sm">{error || 'No data'}</p>
        <button onClick={load} className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 transition-colors">
          Retry
        </button>
      </div>
    )
  }

  const { stats, jobs_funnel, source_breakdown, avg_time_per_stage } = data
  const maxSource = Math.max(...source_breakdown.map(s => s.count), 1)
  const maxAvgDays = Math.max(...avg_time_per_stage.map(s => s.avgDays), 1)

  return (
    <div className="flex flex-col gap-6 px-8 py-8 max-w-7xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Analytics</h1>
          <p className="text-sm text-slate-400 mt-0.5">Pipeline health, source mix, and hiring velocity</p>
        </div>
        <div className="flex items-center gap-3">
          {updatedAt && (
            <span className="text-xs text-slate-400">Updated {timeAgo(updatedAt)}</span>
          )}
          <button
            onClick={load}
            className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Active Candidates"  value={stats.active_candidates}  icon={Users}       color="bg-blue-500"    sub={`${stats.in_pipeline} in pipeline`} />
        <StatCard label="Active Jobs"        value={stats.active_jobs}        icon={Briefcase}   color="bg-violet-500"  />
        <StatCard label="In Interviews"      value={stats.interviewing}       icon={Clock}       color="bg-amber-500"   />
        <StatCard label="Total Applications" value={stats.total_applications} icon={TrendingUp}  color="bg-slate-500"   />
        <StatCard label="Hired"              value={stats.total_hired}        icon={CheckCircle} color="bg-emerald-500" />
        <StatCard label="Rejected"           value={stats.total_rejected}     icon={XCircle}     color="bg-red-400"     />
      </div>

      {/* Pipeline Funnel */}
      <div className="rounded-2xl bg-white border border-slate-200 p-6">
        <h2 className="text-sm font-bold text-slate-900 mb-1">Pipeline Funnel</h2>
        <p className="text-xs text-slate-400 mb-5">Active candidates by stage for each open job</p>

        {jobs_funnel.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-8">No active candidates in any pipeline yet.</p>
        ) : (
          <div className="space-y-6">
            {jobs_funnel.map(job => {
              const maxCount = Math.max(...job.stages.map(s => s.count), 1)
              return (
                <div key={job.id}>
                  <div className="flex items-baseline justify-between mb-2">
                    <div>
                      <span className="text-sm font-semibold text-slate-800">{job.title}</span>
                      {job.department && (
                        <span className="ml-2 text-xs text-slate-400">{job.department}</span>
                      )}
                    </div>
                    <span className="text-xs font-semibold text-slate-500">{job.total} active</span>
                  </div>
                  <div className="space-y-1.5">
                    {job.stages.filter(s => s.count > 0).map(stage => (
                      <div key={stage.id} className="flex items-center gap-3">
                        <span className={`w-24 shrink-0 text-right text-xs font-medium ${STAGE_TEXT[stage.color] ?? 'text-slate-500'}`}>
                          {stage.name}
                        </span>
                        <div className="flex-1 h-6 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${STAGE_BAR[stage.color] ?? 'bg-slate-400'}`}
                            style={{ width: `${pct(stage.count, maxCount)}%`, minWidth: stage.count > 0 ? '2rem' : '0' }}
                          />
                        </div>
                        <span className="w-6 shrink-0 text-xs font-bold text-slate-600">{stage.count}</span>
                      </div>
                    ))}
                    {job.stages.every(s => s.count === 0) && (
                      <p className="text-xs text-slate-400 italic">No candidates staged yet</p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Source Breakdown */}
        <div className="rounded-2xl bg-white border border-slate-200 p-6">
          <h2 className="text-sm font-bold text-slate-900 mb-1">Candidate Sources</h2>
          <p className="text-xs text-slate-400 mb-5">Where candidates are coming from</p>

          {source_breakdown.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-8">No applications yet.</p>
          ) : (
            <div className="space-y-3">
              {source_breakdown.map(({ source, count }) => (
                <div key={source} className="flex items-center gap-3">
                  <span className="w-28 shrink-0 text-right text-xs font-medium text-slate-600">
                    {SOURCE_LABELS[source] ?? source}
                  </span>
                  <div className="flex-1 h-6 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${SOURCE_COLORS[source] ?? 'bg-slate-400'}`}
                      style={{ width: `${pct(count, maxSource)}%`, minWidth: count > 0 ? '2rem' : '0' }}
                    />
                  </div>
                  <span className="w-10 shrink-0 text-xs font-bold text-slate-600">
                    {count} <span className="font-normal text-slate-400">({pct(count, stats.total_applications)}%)</span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Time in Pipeline */}
        <div className="rounded-2xl bg-white border border-slate-200 p-6">
          <h2 className="text-sm font-bold text-slate-900 mb-1">Time in Pipeline</h2>
          <p className="text-xs text-slate-400 mb-5">Avg days since application for candidates currently in each stage</p>

          {avg_time_per_stage.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-8">No active candidates to measure.</p>
          ) : (
            <div className="space-y-3">
              {avg_time_per_stage.map(({ name, avgDays, count }) => (
                <div key={name} className="flex items-center gap-3">
                  <span className="w-28 shrink-0 text-right text-xs font-medium text-slate-600">{name}</span>
                  <div className="flex-1 h-6 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full bg-indigo-400 transition-all"
                      style={{ width: `${pct(avgDays, maxAvgDays)}%`, minWidth: avgDays > 0 ? '2rem' : '0' }}
                    />
                  </div>
                  <span className="w-16 shrink-0 text-xs font-bold text-slate-600">
                    {avgDays}d <span className="font-normal text-slate-400">({count})</span>
                  </span>
                </div>
              ))}
            </div>
          )}

          <p className="mt-4 text-xs text-slate-400 border-t border-slate-100 pt-3">
            Numbers in parentheses show candidate count per stage.
          </p>
        </div>
      </div>

      {/* Conversion summary */}
      {stats.total_applications > 0 && (
        <div className="rounded-2xl bg-white border border-slate-200 p-6">
          <h2 className="text-sm font-bold text-slate-900 mb-4">Overall Conversion</h2>
          <div className="flex items-center gap-0">
            {[
              { label: 'Applied',    value: stats.total_applications, color: 'bg-slate-200 text-slate-700' },
              { label: 'In Pipeline', value: stats.in_pipeline,      color: 'bg-blue-100 text-blue-700'   },
              { label: 'Hired',      value: stats.total_hired,        color: 'bg-emerald-100 text-emerald-700' },
            ].map((step, i) => (
              <div key={step.label} className="flex items-center gap-0 flex-1 min-w-0">
                <div className={`flex-1 rounded-xl px-4 py-3 text-center ${step.color}`}>
                  <p className="text-xl font-bold">{step.value}</p>
                  <p className="text-xs font-medium mt-0.5">{step.label}</p>
                  {i > 0 && (
                    <p className="text-[10px] mt-0.5 opacity-70">
                      {pct(step.value, stats.total_applications)}% of total
                    </p>
                  )}
                </div>
                {i < 2 && (
                  <div className="flex items-center px-2 shrink-0">
                    <svg className="h-4 w-4 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
