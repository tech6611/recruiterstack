'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '@clerk/nextjs'
import Link from 'next/link'
import {
  Home,
  BarChart2,
  Eye,
  Layers,
  Users,
  Star,
  Shield,
  BarChart,
  Plus,
  Pencil,
  Trash2,
  Check,
  X,
  Search,
  ChevronRight,
  MapPin,
  Clock,
  AlertCircle,
  CheckSquare,
  MessageSquare,
  Bell,
  AtSign,
  Workflow,
  RefreshCw,
  Video,
  ArrowRight,
} from 'lucide-react'
import type { StageColor } from '@/lib/types/database'

// ── Types ─────────────────────────────────────────────────────────────────────

interface UpcomingInterview {
  id:             string
  candidate_id:   string
  candidate_name: string
  job_id:         string
  job_title:      string
  stage_name:     string
  moved_at:       string
}

interface TaskApproval {
  id:         string
  title:      string
  department: string | null
  location:   string | null
  status:     string
  created_at: string
}

interface TaskFeedback {
  id:             string
  candidate_id:   string
  candidate_name: string
  job_title:      string
  stage_name:     string
  moved_at:       string
}

interface TaskFollowup {
  id:             string
  candidate_id:   string
  candidate_name: string
  job_title:      string
  last_event_at:  string
  app_status:     string
}

interface ApplicationReviewItem {
  job_id:     string
  job_title:  string
  department: string | null
  location:   string | null
  count:      number
}

interface TopJob {
  id:               string
  position_title:   string
  department:       string | null
  location:         string | null
  ticket_number:    string | null
  status:           string
  total_candidates: number
  stage_counts: {
    stage_id: string; stage_name: string; color: StageColor; count: number
  }[]
}

interface DashboardData {
  stats: {
    open_jobs:               number
    total_jobs:              number
    active_candidates:       number
    interviewing:            number
    hired_total:             number
    pending_offers:          number
    interviews_to_schedule:  number
    overdue_followups_count: number
  }
  upcoming_interviews: UpcomingInterview[]
  tasks: {
    pending_approvals: TaskApproval[]
    feedback_needed:   TaskFeedback[]
    overdue_followups: TaskFollowup[]
  }
  application_review:  ApplicationReviewItem[]
  top_jobs:            TopJob[]
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1)  return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24)  return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 7)  return `${days}d ago`
  const wks = Math.floor(days / 7)
  if (wks < 52)  return `${wks}w ago`
  return `${Math.floor(wks / 52)}y ago`
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
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

// ── View type & defaults ──────────────────────────────────────────────────────

interface DashView {
  id:   string
  name: string
  icon: string
}

const DEFAULT_VIEWS: DashView[] = [
  { id: 'home',      name: 'Home',                 icon: 'home'    },
  { id: 'recruiter', name: 'Recruiter Dashboard',  icon: 'chart'   },
  { id: 'exec',      name: 'Exec Review',          icon: 'eye'     },
  { id: 'dept',      name: 'Department View',      icon: 'layers'  },
  { id: 'pipeline',  name: 'Pipeline View',        icon: 'workflow' },
  { id: 'data',      name: 'Data Quality',         icon: 'shield'  },
]

const VIEW_ICONS: Record<string, React.FC<{ className?: string }>> = {
  home:     Home,
  chart:    BarChart2,
  eye:      Eye,
  layers:   Layers,
  workflow: Workflow,
  shield:   Shield,
  users:    Users,
  star:     Star,
  bar:      BarChart,
}

const LS_KEY = 'rs_dashboard_views'
const LS_ACTIVE = 'rs_dashboard_active_view'

// ── ViewsSidebar ──────────────────────────────────────────────────────────────

function ViewsSidebar({
  views,
  activeId,
  editMode,
  onSelect,
  onToggleEdit,
  onAdd,
  onRename,
  onDelete,
}: {
  views:        DashView[]
  activeId:     string
  editMode:     boolean
  onSelect:     (id: string) => void
  onToggleEdit: () => void
  onAdd:        () => void
  onRename:     (id: string, name: string) => void
  onDelete:     (id: string) => void
}) {
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameVal, setRenameVal]   = useState('')
  const renameRef = useRef<HTMLInputElement>(null)

  function startRename(v: DashView) {
    setRenamingId(v.id)
    setRenameVal(v.name)
    setTimeout(() => renameRef.current?.focus(), 30)
  }

  function commitRename() {
    if (renamingId && renameVal.trim()) {
      onRename(renamingId, renameVal.trim())
    }
    setRenamingId(null)
  }

  return (
    <aside className="sticky top-0 h-screen w-44 shrink-0 overflow-y-auto border-r border-slate-200 bg-white">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-5 pb-2">
        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Views</span>
        <button
          onClick={onToggleEdit}
          className={`text-xs font-medium transition-colors ${
            editMode ? 'text-blue-600' : 'text-slate-400 hover:text-slate-700'
          }`}
        >
          {editMode ? 'Done' : 'Edit'}
        </button>
      </div>

      {/* View list */}
      <nav className="px-2 pb-4 space-y-0.5">
        {views.map(v => {
          const Icon    = VIEW_ICONS[v.icon] ?? Home
          const isActive = v.id === activeId

          return (
            <div key={v.id} className="group relative">
              {renamingId === v.id ? (
                <div className="flex items-center gap-1 rounded-lg bg-blue-50 px-2 py-1.5">
                  <Icon className="h-3.5 w-3.5 shrink-0 text-blue-500" />
                  <input
                    ref={renameRef}
                    value={renameVal}
                    onChange={e => setRenameVal(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter')  commitRename()
                      if (e.key === 'Escape') setRenamingId(null)
                    }}
                    onBlur={commitRename}
                    className="min-w-0 flex-1 bg-transparent text-xs font-medium text-blue-700 outline-none"
                  />
                </div>
              ) : (
                <button
                  onClick={() => onSelect(v.id)}
                  className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left transition-colors ${
                    isActive
                      ? 'bg-blue-50 text-blue-700'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                  }`}
                >
                  <Icon
                    className={`h-3.5 w-3.5 shrink-0 ${isActive ? 'text-blue-500' : 'text-slate-400'}`}
                  />
                  <span className="truncate text-xs font-medium">{v.name}</span>
                </button>
              )}

              {/* Edit-mode actions */}
              {editMode && renamingId !== v.id && (
                <div className="absolute right-1 top-1/2 -translate-y-1/2 hidden items-center gap-0.5 group-hover:flex">
                  <button
                    onClick={() => startRename(v)}
                    className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                  >
                    <Pencil className="h-3 w-3" />
                  </button>
                  <button
                    onClick={() => onDelete(v.id)}
                    className="rounded p-0.5 text-slate-400 hover:bg-red-50 hover:text-red-500"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </nav>

      {/* Add button */}
      <div className="border-t border-slate-100 px-3 py-3">
        <button
          onClick={onAdd}
          className="flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs text-slate-500 hover:bg-slate-50 hover:text-slate-800 transition-colors"
        >
          <Plus className="h-3.5 w-3.5" />
          Add
        </button>
      </div>
    </aside>
  )
}

// ── InterviewsSection ─────────────────────────────────────────────────────────

function InterviewsSection({ interviews }: { interviews: UpcomingInterview[] }) {
  return (
    <section className="border-b border-slate-100">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4">
        <h2 className="text-sm font-semibold text-slate-900">Interviews</h2>
        <div className="flex items-center gap-3">
          <Link
            href="/candidates"
            className="text-xs text-slate-500 hover:text-slate-800 transition-colors"
          >
            Past Interviews
          </Link>
          <button className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors">
            <Search className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="px-6 pb-4">
        {/* Column headers */}
        <div className="grid grid-cols-[2fr_2fr_1.5fr_1fr] gap-4 border-b border-slate-100 pb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
          <span>Interview</span>
          <span>Candidate</span>
          <span>Date</span>
          <span>Your Role</span>
        </div>

        {interviews.length === 0 ? (
          <div className="py-8 text-center text-sm text-slate-400">
            No upcoming interviews.{' '}
            <Link href="/candidates" className="text-blue-500 hover:underline">
              View all candidates
            </Link>
          </div>
        ) : (
          <>
            {/* Group header */}
            <div className="mt-3 mb-1 flex items-center gap-2">
              <div className="h-px flex-1 bg-slate-100" />
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                Upcoming ({interviews.length})
              </span>
              <div className="h-px flex-1 bg-slate-100" />
            </div>

            {interviews.map(iv => (
              <Link
                key={iv.id}
                href={`/candidates/${iv.candidate_id}`}
                className="grid grid-cols-[2fr_2fr_1.5fr_1fr] items-center gap-4 border-b border-slate-50 py-2.5 text-sm hover:bg-slate-50 transition-colors rounded-sm"
              >
                {/* Interview column */}
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium text-slate-800">{iv.stage_name}</p>
                  <div className="mt-0.5 flex items-center gap-1">
                    <Video className="h-3 w-3 text-slate-400" />
                    <span className="text-[10px] text-slate-400">RecruiterStack</span>
                  </div>
                </div>

                {/* Candidate column */}
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium text-slate-800">{iv.candidate_name}</p>
                  <p className="truncate text-[10px] text-slate-400">{iv.job_title}</p>
                </div>

                {/* Date column */}
                <div>
                  <p className="text-[10px] text-slate-600">{formatDate(iv.moved_at)}</p>
                  <p className="text-[10px] text-slate-400">{timeAgo(iv.moved_at)}</p>
                </div>

                {/* Role badge */}
                <div>
                  <span className="inline-block rounded bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                    Interviewer
                  </span>
                </div>
              </Link>
            ))}
          </>
        )}
      </div>
    </section>
  )
}

// ── TasksSection ──────────────────────────────────────────────────────────────

type TaskTab = 'all' | 'approvals' | 'feedback' | 'followups' | 'mentions' | 'sequences'

function TasksSection({ tasks }: { tasks: DashboardData['tasks'] }) {
  const [activeTab, setActiveTab] = useState<TaskTab>('all')

  const counts = {
    approvals: tasks.pending_approvals.length,
    feedback:  tasks.feedback_needed.length,
    followups: tasks.overdue_followups.length,
    mentions:  0,
    sequences: 0,
  }

  const TABS: { key: TaskTab; label: string; count?: number }[] = [
    { key: 'all',       label: 'All' },
    { key: 'approvals', label: 'Approvals', count: counts.approvals },
    { key: 'feedback',  label: 'Feedback',  count: counts.feedback  },
    { key: 'followups', label: 'Followups', count: counts.followups },
    { key: 'mentions',  label: 'Mentions',  count: counts.mentions  },
    { key: 'sequences', label: 'Sequences', count: counts.sequences },
  ]

  const showApprovals = activeTab === 'all' || activeTab === 'approvals'
  const showFeedback  = activeTab === 'all' || activeTab === 'feedback'
  const showFollowups = activeTab === 'all' || activeTab === 'followups'

  const totalAll = counts.approvals + counts.feedback + counts.followups

  return (
    <section className="px-6 py-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-slate-900">Tasks</h2>
        <button className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors">
          <Search className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-0 border-b border-slate-200 mb-4">
        {TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-1.5 border-b-2 px-3 py-2 text-xs font-medium transition-colors ${
              activeTab === tab.key
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            {tab.label}
            {tab.count !== undefined && tab.count > 0 && (
              <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none ${
                activeTab === tab.key ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'
              }`}>
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Task content */}
      {totalAll === 0 && activeTab === 'all' ? (
        <div className="py-10 text-center text-sm text-slate-400">
          All caught up! No pending tasks.
        </div>
      ) : (
        <div className="space-y-1">

          {/* ── Approvals ── */}
          {showApprovals && tasks.pending_approvals.map(t => (
            <Link
              key={t.id}
              href={`/jobs/${t.id}`}
              className="flex items-start gap-3 rounded-lg px-3 py-2.5 hover:bg-slate-50 transition-colors"
            >
              <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded bg-emerald-100">
                <CheckSquare className="h-3 w-3 text-emerald-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-0.5">
                  Approval
                </p>
                <p className="text-sm font-medium text-slate-800 truncate">{t.title}</p>
                <p className="text-xs text-slate-400">
                  {t.department ?? 'No department'}
                  {t.location ? ` · ${t.location}` : ''}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <span className="text-xs text-slate-400">Opening</span>
                <p className="text-[10px] text-amber-500 font-medium">{timeAgo(t.created_at)}</p>
              </div>
            </Link>
          ))}

          {/* ── Feedback needed ── */}
          {showFeedback && tasks.feedback_needed.map(t => (
            <Link
              key={t.id}
              href={`/candidates/${t.candidate_id}`}
              className="flex items-start gap-3 rounded-lg px-3 py-2.5 hover:bg-slate-50 transition-colors"
            >
              <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded bg-amber-100">
                <MessageSquare className="h-3 w-3 text-amber-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-0.5">
                  Interview Feedback
                </p>
                <p className="text-sm font-medium text-slate-800 truncate">{t.candidate_name}</p>
                <p className="text-xs text-slate-400 truncate">{t.job_title} · {t.stage_name}</p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-xs text-slate-400">{formatDate(t.moved_at)}</p>
                <p className="text-[10px] text-amber-500 font-medium">{timeAgo(t.moved_at)}</p>
              </div>
            </Link>
          ))}

          {/* ── Overdue followups ── */}
          {showFollowups && tasks.overdue_followups.map(t => (
            <Link
              key={t.id}
              href={`/candidates/${t.candidate_id}`}
              className="flex items-start gap-3 rounded-lg px-3 py-2.5 hover:bg-slate-50 transition-colors"
            >
              <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded bg-red-100">
                <Bell className="h-3 w-3 text-red-500" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-0.5">
                  Overdue Follow-up
                </p>
                <p className="text-sm font-medium text-slate-800 truncate">{t.candidate_name}</p>
                <p className="text-xs text-slate-400 truncate">{t.job_title}</p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-xs text-slate-400">{formatDate(t.last_event_at)}</p>
                <p className="text-[10px] text-red-500 font-medium">{timeAgo(t.last_event_at)}</p>
              </div>
            </Link>
          ))}

          {/* Empty state for specific tabs */}
          {activeTab === 'mentions'  && <EmptyTab label="No mentions" />}
          {activeTab === 'sequences' && <EmptyTab label="No active sequences" />}
          {activeTab === 'approvals' && tasks.pending_approvals.length === 0 && <EmptyTab label="No approvals pending" />}
          {activeTab === 'feedback'  && tasks.feedback_needed.length === 0    && <EmptyTab label="No feedback needed" />}
          {activeTab === 'followups' && tasks.overdue_followups.length === 0  && <EmptyTab label="No overdue follow-ups" />}
        </div>
      )}
    </section>
  )
}

function EmptyTab({ label }: { label: string }) {
  return (
    <p className="py-6 text-center text-sm text-slate-400">{label}</p>
  )
}

// ── ActivityPanel ─────────────────────────────────────────────────────────────

function ActivityPanel({
  stats,
  applicationReview,
  topJobs,
}: {
  stats:             DashboardData['stats']
  applicationReview: ApplicationReviewItem[]
  topJobs:           TopJob[]
}) {
  const [activityTab, setActivityTab] = useState<'mine' | 'all'>('mine')

  const ACTIVITY_STATS = [
    {
      label:   'Application Review',
      value:   null as number | null,
      href:    '/candidates',
      color:   '',
    },
    {
      label:   'Interviews to Schedule',
      value:   stats.interviews_to_schedule,
      href:    '/candidates',
      color:   stats.interviews_to_schedule > 0 ? 'text-blue-600' : 'text-slate-800',
    },
    {
      label:   'Overdue Follow-ups',
      value:   stats.overdue_followups_count,
      href:    '/candidates',
      color:   stats.overdue_followups_count > 0 ? 'text-red-500' : 'text-emerald-600',
    },
    {
      label:   'Pending Offers',
      value:   stats.pending_offers,
      href:    '/candidates',
      color:   stats.pending_offers > 0 ? 'text-violet-600' : 'text-slate-800',
    },
    {
      label:   'Active Candidates',
      value:   stats.active_candidates,
      href:    '/candidates',
      color:   'text-slate-800',
    },
  ]

  return (
    <aside className="sticky top-0 h-screen w-72 shrink-0 overflow-y-auto border-l border-slate-200 bg-white">

      {/* Activities */}
      <div className="border-b border-slate-100 px-4 pt-5 pb-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-900">Activities</h3>
        </div>

        {/* My / All tabs */}
        <div className="mb-3 flex gap-0 border-b border-slate-100">
          <button
            onClick={() => setActivityTab('mine')}
            className={`border-b-2 px-3 py-1.5 text-xs font-medium transition-colors ${
              activityTab === 'mine'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            My Activities
          </button>
          <button
            onClick={() => setActivityTab('all')}
            className={`border-b-2 px-3 py-1.5 text-xs font-medium transition-colors ${
              activityTab === 'all'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            All Activities
          </button>
        </div>

        {/* Stat rows */}
        <div className="space-y-0.5">
          {ACTIVITY_STATS.map(stat => (
            <Link
              key={stat.label}
              href={stat.href}
              className="flex items-center justify-between rounded-lg px-2 py-1.5 hover:bg-slate-50 transition-colors"
            >
              <span className="text-xs text-slate-600">{stat.label}</span>
              {stat.value !== null && (
                <span className={`text-xs font-semibold ${stat.color}`}>
                  {stat.value}
                </span>
              )}
              {stat.value === null && (
                <ChevronRight className="h-3 w-3 text-slate-300" />
              )}
            </Link>
          ))}
        </div>
      </div>

      {/* Application Review */}
      {applicationReview.length > 0 && (
        <div className="border-b border-slate-100 px-4 py-4">
          <h3 className="mb-3 text-xs font-semibold text-slate-900">Application Review</h3>
          <div className="space-y-0.5">
            {applicationReview.map(item => (
              <Link
                key={item.job_id}
                href={`/jobs/${item.job_id}`}
                className="flex items-start justify-between gap-2 rounded-lg px-2 py-1.5 hover:bg-slate-50 transition-colors"
              >
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium text-slate-800">{item.job_title}</p>
                  <p className="text-[10px] text-slate-400">Application Review</p>
                </div>
                <div className="shrink-0 text-right">
                  <span className="text-xs font-medium text-blue-600">
                    {item.count} Application{item.count !== 1 ? 's' : ''}
                  </span>
                  <ArrowRight className="ml-1 inline h-3 w-3 text-blue-400" />
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Jobs */}
      <div className="px-4 py-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-xs font-semibold text-slate-900">Jobs</h3>
          <Link
            href="/jobs"
            className="text-[10px] font-medium text-blue-600 hover:text-blue-700 transition-colors"
          >
            View All Jobs
          </Link>
        </div>

        {topJobs.length === 0 ? (
          <p className="text-xs text-slate-400">No open jobs.</p>
        ) : (
          <div className="space-y-0.5">
            {topJobs.map(job => (
              <Link
                key={job.id}
                href={`/jobs/${job.id}`}
                className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 hover:bg-slate-50 transition-colors"
              >
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium text-slate-800">{job.position_title}</p>
                  {job.location && (
                    <div className="flex items-center gap-1">
                      <MapPin className="h-2.5 w-2.5 text-slate-400" />
                      <span className="text-[10px] text-slate-400">{job.location}</span>
                    </div>
                  )}
                </div>
                <span className="shrink-0 text-xs font-semibold text-slate-700">
                  {job.total_candidates}
                </span>
              </Link>
            ))}
          </div>
        )}

        {/* Pipeline mini-bar for top job */}
        {topJobs.length > 0 && topJobs[0].stage_counts.length > 0 && (
          <div className="mt-3 border-t border-slate-100 pt-3">
            <p className="mb-1 text-[10px] text-slate-400">Pipeline — {topJobs[0].position_title}</p>
            <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-slate-100 gap-0.5">
              {topJobs[0].stage_counts.map(s => {
                const pct = topJobs[0].total_candidates > 0
                  ? (s.count / topJobs[0].total_candidates) * 100
                  : 0
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
            <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
              {topJobs[0].stage_counts.filter(s => s.count > 0).map(s => (
                <div key={s.stage_id} className="flex items-center gap-1">
                  <div className={`h-1.5 w-1.5 rounded-full ${STAGE_COLORS[s.color] ?? 'bg-slate-400'}`} />
                  <span className="text-[10px] text-slate-500">{s.stage_name}</span>
                  <span className="text-[10px] font-semibold text-slate-700">{s.count}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </aside>
  )
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function DashboardSkeleton() {
  return (
    <div className="flex h-screen">
      {/* Views sidebar skeleton */}
      <aside className="w-44 shrink-0 border-r border-slate-200 bg-white px-3 py-5">
        <div className="mb-3 h-3 w-16 rounded bg-slate-100 animate-pulse" />
        {[...Array(6)].map((_, i) => (
          <div key={i} className="mb-2 h-6 rounded-lg bg-slate-50 animate-pulse" />
        ))}
      </aside>

      {/* Center skeleton */}
      <div className="flex-1 px-6 py-4 space-y-4">
        <div className="h-4 w-24 rounded bg-slate-100 animate-pulse" />
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-10 rounded-lg border bg-slate-50 animate-pulse" />
        ))}
        <div className="mt-4 h-4 w-16 rounded bg-slate-100 animate-pulse" />
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-10 rounded-lg border bg-slate-50 animate-pulse" />
        ))}
      </div>

      {/* Right panel skeleton */}
      <aside className="w-72 shrink-0 border-l border-slate-200 bg-white px-4 py-5 space-y-3">
        <div className="h-4 w-20 rounded bg-slate-100 animate-pulse" />
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-6 rounded bg-slate-50 animate-pulse" />
        ))}
      </aside>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { orgId } = useAuth()

  // ── Data state ──
  const [data, setData]         = useState<DashboardData | null>(null)
  const [loading, setLoading]   = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  // ── Views state (localStorage) ──
  const [views, setViews]           = useState<DashView[]>(DEFAULT_VIEWS)
  const [activeViewId, setActiveViewId] = useState<string>('home')
  const [editMode, setEditMode]         = useState(false)
  const [hydrated, setHydrated]         = useState(false)

  // Hydrate from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(LS_KEY)
      if (stored) setViews(JSON.parse(stored))
      const storedActive = localStorage.getItem(LS_ACTIVE)
      if (storedActive) setActiveViewId(storedActive)
    } catch {}
    setHydrated(true)
  }, [])

  // Persist views
  useEffect(() => {
    if (!hydrated) return
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(views))
    } catch {}
  }, [views, hydrated])

  // Persist active view
  useEffect(() => {
    if (!hydrated) return
    try {
      localStorage.setItem(LS_ACTIVE, activeViewId)
    } catch {}
  }, [activeViewId, hydrated])

  // ── Fetch data ──
  const fetchData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true)
    else           setLoading(true)
    try {
      const res = await fetch('/api/dashboard')
      if (res.ok) setData(await res.json())
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    if (orgId) fetchData()
  }, [fetchData, orgId])

  // ── Views handlers ──
  function handleAddView() {
    const newView: DashView = {
      id:   `view-${Date.now()}`,
      name: 'New View',
      icon: 'chart',
    }
    setViews(prev => [...prev, newView])
    setActiveViewId(newView.id)
    setEditMode(true)
  }

  function handleRenameView(id: string, name: string) {
    setViews(prev => prev.map(v => v.id === id ? { ...v, name } : v))
  }

  function handleDeleteView(id: string) {
    setViews(prev => {
      const next = prev.filter(v => v.id !== id)
      if (activeViewId === id && next.length > 0) {
        setActiveViewId(next[0].id)
      }
      return next
    })
  }

  // ── Render ──
  if (loading || !hydrated) return <DashboardSkeleton />

  if (!data) {
    return (
      <div className="flex items-center justify-center p-16 text-sm text-slate-400">
        Failed to load dashboard.{' '}
        <button onClick={() => fetchData()} className="ml-2 text-blue-500 underline">
          Retry
        </button>
      </div>
    )
  }

  return (
    <div className="flex bg-white">

      {/* ── Views Sidebar ── */}
      <ViewsSidebar
        views={views}
        activeId={activeViewId}
        editMode={editMode}
        onSelect={setActiveViewId}
        onToggleEdit={() => setEditMode(prev => !prev)}
        onAdd={handleAddView}
        onRename={handleRenameView}
        onDelete={handleDeleteView}
      />

      {/* ── Center main content ── */}
      <div className="flex-1 min-w-0 divide-y divide-slate-100">

        {/* View header bar */}
        <div className="flex items-center justify-between px-6 py-3 border-b border-slate-200">
          <div className="flex items-center gap-2">
            {(() => {
              const activeView = views.find(v => v.id === activeViewId)
              if (!activeView) return null
              const Icon = VIEW_ICONS[activeView.icon] ?? Home
              return (
                <>
                  <Icon className="h-4 w-4 text-slate-500" />
                  <span className="text-sm font-semibold text-slate-800">{activeView.name}</span>
                </>
              )
            })()}
          </div>
          <button
            onClick={() => fetchData(true)}
            disabled={refreshing}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-500 hover:bg-slate-50 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`h-3 w-3 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {/* Sections */}
        <InterviewsSection interviews={data.upcoming_interviews} />
        <TasksSection tasks={data.tasks} />
      </div>

      {/* ── Right activity panel ── */}
      <ActivityPanel
        stats={data.stats}
        applicationReview={data.application_review}
        topJobs={data.top_jobs}
      />
    </div>
  )
}
