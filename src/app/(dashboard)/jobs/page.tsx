'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Briefcase, Plus, Search, Clock, ChevronRight } from 'lucide-react'
import type { JobListItem, HiringRequestStatus, StageColor } from '@/lib/types/database'

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<HiringRequestStatus, string> = {
  intake_pending:   'Intake Pending',
  intake_submitted: 'Intake Submitted',
  jd_generated:     'JD Generated',
  jd_sent:          'JD Sent',
  jd_approved:      'Active',
  posted:           'Posted',
}

const STATUS_COLORS: Record<HiringRequestStatus, string> = {
  intake_pending:   'bg-slate-100 text-slate-600',
  intake_submitted: 'bg-blue-50 text-blue-700',
  jd_generated:     'bg-violet-50 text-violet-700',
  jd_sent:          'bg-amber-50 text-amber-700',
  jd_approved:      'bg-emerald-50 text-emerald-700',
  posted:           'bg-green-50 text-green-700',
}

const STAGE_DOT: Record<StageColor, string> = {
  slate:   'bg-slate-400',
  blue:    'bg-blue-500',
  violet:  'bg-violet-500',
  amber:   'bg-amber-500',
  emerald: 'bg-emerald-500',
  green:   'bg-green-500',
  red:     'bg-red-500',
  pink:    'bg-pink-500',
}

function daysSince(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime()
  return Math.floor(diff / (1000 * 60 * 60 * 24))
}

function initials(name: string) {
  return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
}

// ── Pipeline Bar ──────────────────────────────────────────────────────────────

function PipelineBar({ stages }: { stages: JobListItem['stage_counts'] }) {
  const total = stages.reduce((s, c) => s + c.count, 0)
  if (total === 0) {
    return <span className="text-xs text-slate-400">No candidates yet</span>
  }
  return (
    <div className="flex items-center gap-2 flex-wrap">
      {stages.filter(s => s.count > 0).map(s => (
        <div key={s.stage_id} className="flex items-center gap-1">
          <span className={`h-2 w-2 rounded-full ${STAGE_DOT[s.color] ?? 'bg-slate-400'}`} />
          <span className="text-xs text-slate-600 font-medium">{s.count}</span>
          <span className="text-xs text-slate-400">{s.stage_name}</span>
        </div>
      ))}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function JobsPage() {
  const router = useRouter()
  const [jobs, setJobs] = useState<JobListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')

  useEffect(() => {
    fetch('/api/jobs')
      .then(r => r.json())
      .then(j => setJobs(j.data ?? []))
      .finally(() => setLoading(false))
  }, [])

  const filtered = useMemo(() => {
    let list = jobs
    if (search) {
      const q = search.toLowerCase()
      list = list.filter(j =>
        j.position_title.toLowerCase().includes(q) ||
        (j.department ?? '').toLowerCase().includes(q) ||
        (j.location ?? '').toLowerCase().includes(q)
      )
    }
    if (statusFilter !== 'all') {
      list = list.filter(j => j.status === statusFilter)
    }
    return list
  }, [jobs, search, statusFilter])

  const totals = useMemo(() => ({
    all: jobs.length,
    active: jobs.filter(j => j.status === 'jd_approved' || j.status === 'posted').length,
    pending: jobs.filter(j => ['intake_pending', 'intake_submitted', 'jd_generated', 'jd_sent'].includes(j.status)).length,
  }), [jobs])

  return (
    <div className="flex flex-col min-h-full">
      {/* Header */}
      <div className="px-8 pt-8 pb-6 border-b border-slate-200 bg-white">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Jobs</h1>
            <p className="text-sm text-slate-500 mt-0.5">Manage open roles and candidate pipelines</p>
          </div>
          <button
            onClick={() => router.push('/hiring-requests/new')}
            className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 transition-colors shadow-sm"
          >
            <Plus className="h-4 w-4" />
            New Job
          </button>
        </div>

        {/* Stat pills */}
        <div className="flex gap-3">
          {[
            { label: 'All Jobs', value: totals.all, key: 'all' },
            { label: 'Active', value: totals.active, key: 'active' },
            { label: 'Pending', value: totals.pending, key: 'pending' },
          ].map(pill => (
            <button
              key={pill.key}
              onClick={() => setStatusFilter(
                pill.key === 'active' ? 'jd_approved' :
                pill.key === 'pending' ? 'intake_pending' :
                'all'
              )}
              className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-colors border ${
                (pill.key === 'all' && statusFilter === 'all') ||
                (pill.key === 'active' && statusFilter === 'jd_approved') ||
                (pill.key === 'pending' && statusFilter === 'intake_pending')
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
              }`}
            >
              <span className="text-base font-bold">{pill.value}</span>
              <span>{pill.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 px-8 py-4 bg-white border-b border-slate-100">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search jobs..."
            className="w-full rounded-xl border border-slate-200 pl-9 pr-4 py-2 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="all">All statuses</option>
          <option value="jd_approved">Active</option>
          <option value="posted">Posted</option>
          <option value="intake_pending">Intake Pending</option>
          <option value="jd_sent">JD Sent</option>
        </select>
      </div>

      {/* Table */}
      <div className="flex-1 px-8 py-6">
        {loading ? (
          <div className="flex items-center justify-center py-20 text-slate-400 text-sm gap-2">
            <div className="h-4 w-4 rounded-full border-2 border-slate-300 border-t-blue-500 animate-spin" />
            Loading jobs…
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Briefcase className="h-10 w-10 text-slate-300 mb-3" />
            <p className="text-slate-500 font-medium">No jobs found</p>
            <p className="text-sm text-slate-400 mt-1">
              {search || statusFilter !== 'all'
                ? 'Try clearing your filters'
                : 'Create your first job to get started'}
            </p>
          </div>
        ) : (
          <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm">
            {/* Table header */}
            <div className="grid grid-cols-[2fr_1fr_2fr_1.5fr_1fr_auto] gap-4 px-5 py-3 bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase tracking-wide">
              <span>Role</span>
              <span>Location</span>
              <span>Pipeline</span>
              <span>Hiring Manager</span>
              <span>Status</span>
              <span />
            </div>

            {/* Rows */}
            {filtered.map(job => (
              <div
                key={job.id}
                onClick={() => router.push(`/jobs/${job.id}`)}
                className="grid grid-cols-[2fr_1fr_2fr_1.5fr_1fr_auto] gap-4 items-center px-5 py-4 border-b border-slate-100 last:border-0 hover:bg-slate-50 cursor-pointer transition-colors group"
              >
                {/* Role */}
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-slate-900 group-hover:text-blue-700 transition-colors truncate">
                      {job.position_title}
                    </p>
                    {job.ticket_number && (
                      <span className="font-mono text-xs text-slate-400 shrink-0">{job.ticket_number}</span>
                    )}
                  </div>
                  {job.department && (
                    <p className="text-xs text-slate-400 mt-0.5 truncate">{job.department}</p>
                  )}
                </div>

                {/* Location */}
                <div className="text-sm text-slate-600 truncate">
                  {job.location ?? <span className="text-slate-400">—</span>}
                </div>

                {/* Pipeline */}
                <PipelineBar stages={job.stage_counts} />

                {/* HM */}
                <div className="flex items-center gap-2">
                  <div className="h-6 w-6 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
                    <span className="text-xs font-semibold text-blue-700">
                      {initials(job.hiring_manager_name)}
                    </span>
                  </div>
                  <span className="text-sm text-slate-600 truncate">{job.hiring_manager_name}</span>
                </div>

                {/* Status */}
                <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLORS[job.status]}`}>
                  {STATUS_LABELS[job.status]}
                </span>

                {/* Arrow */}
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1 text-xs text-slate-400">
                    <Clock className="h-3.5 w-3.5" />
                    {daysSince(job.created_at)}d
                  </div>
                  <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-blue-500 transition-colors" />
                </div>
              </div>
            ))}
          </div>
        )}

        {!loading && (
          <p className="text-xs text-slate-400 mt-4 text-center">
            Showing {filtered.length} of {jobs.length} job{jobs.length !== 1 ? 's' : ''}
          </p>
        )}
      </div>
    </div>
  )
}
