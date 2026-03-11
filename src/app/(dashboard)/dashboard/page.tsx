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
  Search,
  ChevronRight,
  MapPin,
  CheckSquare,
  MessageSquare,
  Bell,
  Workflow,
  RefreshCw,
  Video,
  ArrowRight,
  GripVertical,
  X,
  Settings2,
  Briefcase,
  UserCheck,
  Activity,
} from 'lucide-react'
import type { StageColor } from '@/lib/types/database'

// ── Types ─────────────────────────────────────────────────────────────────────

interface UpcomingInterview {
  id: string; candidate_id: string; candidate_name: string
  job_id: string; job_title: string; stage_name: string; moved_at: string
}
interface TaskApproval {
  id: string; title: string; department: string | null
  location: string | null; status: string; created_at: string
}
interface TaskFeedback {
  id: string; candidate_id: string; candidate_name: string
  job_title: string; stage_name: string; moved_at: string
}
interface TaskFollowup {
  id: string; candidate_id: string; candidate_name: string
  job_title: string; last_event_at: string; app_status: string
}
interface ApplicationReviewItem {
  job_id: string; job_title: string
  department: string | null; location: string | null; count: number
}
interface TopJob {
  id: string; position_title: string; department: string | null
  location: string | null; ticket_number: string | null
  status: string; total_candidates: number
  stage_counts: { stage_id: string; stage_name: string; color: StageColor; count: number }[]
}
interface StatusBreakdown { status: string; count: number }

interface DashboardData {
  stats: {
    open_jobs: number; total_jobs: number; active_candidates: number
    interviewing: number; hired_total: number; pending_offers: number
    interviews_to_schedule: number; overdue_followups_count: number
  }
  upcoming_interviews: UpcomingInterview[]
  tasks: { pending_approvals: TaskApproval[]; feedback_needed: TaskFeedback[]; overdue_followups: TaskFollowup[] }
  application_review: ApplicationReviewItem[]
  top_jobs: TopJob[]
  candidate_breakdown: StatusBreakdown[]
}

// ── Widget definitions ─────────────────────────────────────────────────────────

type WidgetId = 'interviews' | 'tasks' | 'overview_stats' | 'pipeline' | 'jobs_mini'

interface WidgetDef {
  id:          WidgetId
  name:        string
  description: string
  icon:        React.FC<{ className?: string }>
}

const ALL_WIDGET_DEFS: WidgetDef[] = [
  { id: 'interviews',    name: 'Interviews',        icon: Video,      description: 'Candidates currently in interview stages' },
  { id: 'tasks',         name: 'Tasks',             icon: CheckSquare,description: 'Approvals, feedback, and overdue follow-ups' },
  { id: 'overview_stats',name: 'Overview Stats',    icon: BarChart2,  description: 'Open jobs, active candidates, hiring numbers' },
  { id: 'pipeline',      name: 'Pipeline Overview', icon: Layers,     description: 'Candidate status breakdown across all roles' },
  { id: 'jobs_mini',     name: 'Active Jobs',       icon: Briefcase,  description: 'Open roles with candidate counts' },
]

// ── View type & defaults ──────────────────────────────────────────────────────

interface DashView {
  id: string; name: string; icon: string; widgets: WidgetId[]
}

const DEFAULT_VIEWS: DashView[] = [
  { id: 'home',      name: 'Home',                icon: 'home',     widgets: ['interviews', 'tasks'] },
  { id: 'recruiter', name: 'Recruiter Dashboard', icon: 'chart',    widgets: ['overview_stats', 'interviews', 'tasks'] },
  { id: 'exec',      name: 'Exec Review',         icon: 'eye',      widgets: ['overview_stats', 'pipeline'] },
  { id: 'dept',      name: 'Department View',     icon: 'layers',   widgets: ['overview_stats', 'jobs_mini', 'pipeline'] },
  { id: 'pipeline',  name: 'Pipeline View',       icon: 'workflow', widgets: ['pipeline', 'overview_stats'] },
  { id: 'data',      name: 'Data Quality',        icon: 'shield',   widgets: ['tasks', 'pipeline'] },
]

const VIEW_ICONS: Record<string, React.FC<{ className?: string }>> = {
  home: Home, chart: BarChart2, eye: Eye, layers: Layers,
  workflow: Workflow, shield: Shield, users: Users, star: Star, bar: BarChart,
}

const LS_VIEWS   = 'rs_dashboard_views'
const LS_ACTIVE  = 'rs_dashboard_active_view'

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
  return wks < 52 ? `${wks}w ago` : `${Math.floor(wks / 52)}y ago`
}

function fmtDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
  })
}

const STAGE_COLORS: Record<StageColor, string> = {
  slate: 'bg-slate-400', blue: 'bg-blue-500', violet: 'bg-violet-500',
  amber: 'bg-amber-400', emerald: 'bg-emerald-500', green: 'bg-green-500',
  red: 'bg-red-500', pink: 'bg-pink-500',
}

const STATUS_COLORS: Record<string, { bg: string; label: string }> = {
  active:         { bg: 'bg-blue-500',    label: 'Active' },
  interviewing:   { bg: 'bg-amber-400',   label: 'Interviewing' },
  offer_extended: { bg: 'bg-violet-500',  label: 'Offer Extended' },
  hired:          { bg: 'bg-emerald-500', label: 'Hired' },
  inactive:       { bg: 'bg-slate-300',   label: 'Inactive' },
  rejected:       { bg: 'bg-red-400',     label: 'Rejected' },
}

// ── ViewsSidebar ──────────────────────────────────────────────────────────────

function ViewsSidebar({
  views, activeId, editMode, onSelect, onToggleEdit,
  onAdd, onRename, onDelete,
}: {
  views: DashView[]; activeId: string; editMode: boolean
  onSelect: (id: string) => void; onToggleEdit: () => void
  onAdd: () => void; onRename: (id: string, name: string) => void
  onDelete: (id: string) => void
}) {
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameVal,  setRenameVal]  = useState('')
  const renameRef = useRef<HTMLInputElement>(null)

  function startRename(v: DashView) {
    setRenamingId(v.id)
    setRenameVal(v.name)
    setTimeout(() => renameRef.current?.focus(), 30)
  }

  function commitRename() {
    if (renamingId && renameVal.trim()) onRename(renamingId, renameVal.trim())
    setRenamingId(null)
  }

  return (
    <aside className="sticky top-0 h-screen w-48 shrink-0 overflow-y-auto border-r border-slate-200 bg-white">
      <div className="flex items-center justify-between px-4 pt-5 pb-2">
        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Views</span>
        <button
          onClick={onToggleEdit}
          className={`text-xs font-medium transition-colors ${editMode ? 'text-blue-600' : 'text-slate-400 hover:text-slate-700'}`}
        >
          {editMode ? 'Done' : 'Edit'}
        </button>
      </div>

      <nav className="px-2 pb-4 space-y-0.5">
        {views.map(v => {
          const Icon     = VIEW_ICONS[v.icon] ?? Home
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
                    isActive ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                  }`}
                >
                  <Icon className={`h-3.5 w-3.5 shrink-0 ${isActive ? 'text-blue-500' : 'text-slate-400'}`} />
                  <span className="truncate text-xs font-medium">{v.name}</span>
                </button>
              )}
              {editMode && renamingId !== v.id && (
                <div className="absolute right-1 top-1/2 -translate-y-1/2 hidden items-center gap-0.5 group-hover:flex">
                  <button onClick={() => startRename(v)} className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
                    <Pencil className="h-3 w-3" />
                  </button>
                  <button onClick={() => onDelete(v.id)} className="rounded p-0.5 text-slate-400 hover:bg-red-50 hover:text-red-500">
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </nav>

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

// ── Individual widget components ──────────────────────────────────────────────

function InterviewsWidget({ interviews }: { interviews: UpcomingInterview[] }) {
  return (
    <div>
      <div className="flex items-center justify-between px-1 mb-3">
        <h2 className="text-sm font-semibold text-slate-900">Interviews</h2>
        <div className="flex items-center gap-3">
          <Link href="/candidates" className="text-xs text-slate-500 hover:text-slate-800 transition-colors">
            Past Interviews
          </Link>
          <button className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors">
            <Search className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-[2fr_2fr_1.5fr_1fr] gap-4 border-b border-slate-100 pb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
        <span>Interview</span><span>Candidate</span><span>Date</span><span>Your Role</span>
      </div>

      {interviews.length === 0 ? (
        <div className="py-8 text-center text-sm text-slate-400">
          No upcoming interviews.{' '}
          <Link href="/candidates" className="text-blue-500 hover:underline">View candidates</Link>
        </div>
      ) : (
        <>
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
              className="grid grid-cols-[2fr_2fr_1.5fr_1fr] items-center gap-4 rounded-sm border-b border-slate-50 py-2.5 hover:bg-slate-50 transition-colors"
            >
              <div className="min-w-0">
                <p className="truncate text-xs font-medium text-slate-800">{iv.stage_name}</p>
                <div className="mt-0.5 flex items-center gap-1">
                  <Video className="h-3 w-3 text-slate-400" />
                  <span className="text-[10px] text-slate-400">RecruiterStack</span>
                </div>
              </div>
              <div className="min-w-0">
                <p className="truncate text-xs font-medium text-slate-800">{iv.candidate_name}</p>
                <p className="truncate text-[10px] text-slate-400">{iv.job_title}</p>
              </div>
              <div>
                <p className="text-[10px] text-slate-600">{fmtDate(iv.moved_at)}</p>
                <p className="text-[10px] text-slate-400">{timeAgo(iv.moved_at)}</p>
              </div>
              <span className="inline-block rounded bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                Interviewer
              </span>
            </Link>
          ))}
        </>
      )}
    </div>
  )
}

type TaskTab = 'all' | 'approvals' | 'feedback' | 'followups' | 'mentions' | 'sequences'

function TasksWidget({ tasks }: { tasks: DashboardData['tasks'] }) {
  const [activeTab, setActiveTab] = useState<TaskTab>('all')
  const counts = {
    approvals: tasks.pending_approvals.length,
    feedback:  tasks.feedback_needed.length,
    followups: tasks.overdue_followups.length,
  }
  const TABS: { key: TaskTab; label: string; count?: number }[] = [
    { key: 'all',       label: 'All' },
    { key: 'approvals', label: 'Approvals', count: counts.approvals },
    { key: 'feedback',  label: 'Feedback',  count: counts.feedback  },
    { key: 'followups', label: 'Followups', count: counts.followups },
    { key: 'mentions',  label: 'Mentions',  count: 0 },
    { key: 'sequences', label: 'Sequences', count: 0 },
  ]
  const showApprovals = activeTab === 'all' || activeTab === 'approvals'
  const showFeedback  = activeTab === 'all' || activeTab === 'feedback'
  const showFollowups = activeTab === 'all' || activeTab === 'followups'
  const totalAll = counts.approvals + counts.feedback + counts.followups

  return (
    <div>
      <div className="flex items-center justify-between px-1 mb-3">
        <h2 className="text-sm font-semibold text-slate-900">Tasks</h2>
        <button className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors">
          <Search className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="flex gap-0 border-b border-slate-200 mb-4">
        {TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-1.5 border-b-2 px-3 py-2 text-xs font-medium transition-colors ${
              activeTab === tab.key ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            {tab.label}
            {tab.count !== undefined && tab.count > 0 && (
              <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none ${
                activeTab === tab.key ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'
              }`}>{tab.count}</span>
            )}
          </button>
        ))}
      </div>

      {totalAll === 0 && activeTab === 'all' ? (
        <p className="py-8 text-center text-sm text-slate-400">All caught up! No pending tasks.</p>
      ) : (
        <div className="space-y-0.5">
          {showApprovals && tasks.pending_approvals.map(t => (
            <Link key={t.id} href={`/jobs/${t.id}`}
              className="flex items-start gap-3 rounded-lg px-3 py-2.5 hover:bg-slate-50 transition-colors"
            >
              <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded bg-emerald-100">
                <CheckSquare className="h-3 w-3 text-emerald-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-0.5">Approval</p>
                <p className="text-sm font-medium text-slate-800 truncate">{t.title}</p>
                <p className="text-xs text-slate-400">{t.department ?? 'No department'}{t.location ? ` · ${t.location}` : ''}</p>
              </div>
              <div className="shrink-0 text-right">
                <span className="text-xs text-slate-400">Opening</span>
                <p className="text-[10px] text-amber-500 font-medium">{timeAgo(t.created_at)}</p>
              </div>
            </Link>
          ))}
          {showFeedback && tasks.feedback_needed.map(t => (
            <Link key={t.id} href={`/candidates/${t.candidate_id}`}
              className="flex items-start gap-3 rounded-lg px-3 py-2.5 hover:bg-slate-50 transition-colors"
            >
              <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded bg-amber-100">
                <MessageSquare className="h-3 w-3 text-amber-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-0.5">Interview Feedback</p>
                <p className="text-sm font-medium text-slate-800 truncate">{t.candidate_name}</p>
                <p className="text-xs text-slate-400 truncate">{t.job_title} · {t.stage_name}</p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-xs text-slate-400">{fmtDate(t.moved_at)}</p>
                <p className="text-[10px] text-amber-500 font-medium">{timeAgo(t.moved_at)}</p>
              </div>
            </Link>
          ))}
          {showFollowups && tasks.overdue_followups.map(t => (
            <Link key={t.id} href={`/candidates/${t.candidate_id}`}
              className="flex items-start gap-3 rounded-lg px-3 py-2.5 hover:bg-slate-50 transition-colors"
            >
              <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded bg-red-100">
                <Bell className="h-3 w-3 text-red-500" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-0.5">Overdue Follow-up</p>
                <p className="text-sm font-medium text-slate-800 truncate">{t.candidate_name}</p>
                <p className="text-xs text-slate-400 truncate">{t.job_title}</p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-xs text-slate-400">{fmtDate(t.last_event_at)}</p>
                <p className="text-[10px] text-red-500 font-medium">{timeAgo(t.last_event_at)}</p>
              </div>
            </Link>
          ))}
          {activeTab === 'mentions'  && <p className="py-6 text-center text-sm text-slate-400">No mentions</p>}
          {activeTab === 'sequences' && <p className="py-6 text-center text-sm text-slate-400">No active sequences</p>}
          {activeTab === 'approvals' && tasks.pending_approvals.length === 0 && <p className="py-6 text-center text-sm text-slate-400">No approvals pending</p>}
          {activeTab === 'feedback'  && tasks.feedback_needed.length === 0   && <p className="py-6 text-center text-sm text-slate-400">No feedback needed</p>}
          {activeTab === 'followups' && tasks.overdue_followups.length === 0 && <p className="py-6 text-center text-sm text-slate-400">No overdue follow-ups</p>}
        </div>
      )}
    </div>
  )
}

function OverviewStatsWidget({ stats }: { stats: DashboardData['stats'] }) {
  const CARDS = [
    { label: 'Open Jobs',         value: stats.open_jobs,         icon: Briefcase,  color: 'bg-blue-50 text-blue-700 border-blue-100',    href: '/jobs' },
    { label: 'Active Candidates', value: stats.active_candidates, icon: Users,      color: 'bg-emerald-50 text-emerald-700 border-emerald-100', href: '/candidates' },
    { label: 'Interviewing',      value: stats.interviewing,      icon: Activity,   color: 'bg-amber-50 text-amber-700 border-amber-100',  href: '/candidates' },
    { label: 'Total Hired',       value: stats.hired_total,       icon: UserCheck,  color: 'bg-violet-50 text-violet-700 border-violet-100', href: '/candidates' },
  ]
  return (
    <div>
      <h2 className="mb-3 px-1 text-sm font-semibold text-slate-900">Overview</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {CARDS.map(card => {
          const Icon = card.icon
          return (
            <Link key={card.label} href={card.href}
              className={`flex items-center gap-3 rounded-xl border p-4 transition-all hover:-translate-y-0.5 hover:shadow-sm ${card.color}`}
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/60">
                <Icon className="h-4 w-4" />
              </div>
              <div>
                <p className="text-xl font-bold">{card.value}</p>
                <p className="text-[10px] font-medium opacity-70">{card.label}</p>
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}

function PipelineWidget({ breakdown }: { breakdown: StatusBreakdown[] }) {
  const total = breakdown.reduce((s, b) => s + b.count, 0)
  return (
    <div>
      <h2 className="mb-3 px-1 text-sm font-semibold text-slate-900">Pipeline Overview</h2>
      {total === 0 ? (
        <p className="text-sm text-slate-400">No candidate data yet.</p>
      ) : (
        <div className="space-y-3">
          <div className="flex h-3 w-full overflow-hidden rounded-full gap-0.5">
            {breakdown.filter(b => b.count > 0).map(b => (
              <div
                key={b.status}
                style={{ width: `${(b.count / total) * 100}%` }}
                className={`h-full ${STATUS_COLORS[b.status]?.bg ?? 'bg-slate-300'}`}
                title={`${STATUS_COLORS[b.status]?.label ?? b.status}: ${b.count}`}
              />
            ))}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1.5">
            {breakdown.filter(b => b.count > 0).map(b => (
              <div key={b.status} className="flex items-center gap-1.5">
                <div className={`h-2 w-2 rounded-full ${STATUS_COLORS[b.status]?.bg ?? 'bg-slate-300'}`} />
                <span className="text-xs text-slate-500">{STATUS_COLORS[b.status]?.label ?? b.status}</span>
                <span className="text-xs font-semibold text-slate-700">{b.count}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function JobsMiniWidget({ jobs }: { jobs: TopJob[] }) {
  return (
    <div>
      <div className="mb-3 flex items-center justify-between px-1">
        <h2 className="text-sm font-semibold text-slate-900">Active Jobs</h2>
        <Link href="/jobs" className="text-xs font-medium text-blue-600 hover:text-blue-700 transition-colors">
          View all
        </Link>
      </div>
      {jobs.length === 0 ? (
        <p className="text-sm text-slate-400">No open jobs. <Link href="/jobs" className="text-blue-500 hover:underline">Create one</Link></p>
      ) : (
        <div className="space-y-1">
          {jobs.map(job => (
            <Link key={job.id} href={`/jobs/${job.id}`}
              className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2.5 hover:bg-slate-100 transition-colors"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-slate-800">{job.position_title}</p>
                {job.location && (
                  <div className="flex items-center gap-1">
                    <MapPin className="h-2.5 w-2.5 text-slate-400" />
                    <span className="text-xs text-slate-400">{job.location}</span>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-slate-700">{job.total_candidates}</span>
                <div className="flex h-5 w-16 overflow-hidden rounded-full bg-slate-200 gap-px">
                  {job.stage_counts.filter(s => s.count > 0).map(s => (
                    <div
                      key={s.stage_id}
                      style={{ width: `${job.total_candidates > 0 ? (s.count / job.total_candidates) * 100 : 0}%` }}
                      className={`h-full ${STAGE_COLORS[s.color] ?? 'bg-slate-400'}`}
                      title={`${s.stage_name}: ${s.count}`}
                    />
                  ))}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

// ── ActivityPanel (right column — always visible) ─────────────────────────────

function ActivityPanel({
  stats, applicationReview, topJobs,
}: {
  stats: DashboardData['stats']
  applicationReview: ApplicationReviewItem[]
  topJobs: TopJob[]
}) {
  const [tab, setTab] = useState<'mine' | 'all'>('mine')

  const STAT_ROWS = [
    { label: 'Application Review',      value: null as number | null, href: '/candidates' },
    { label: 'Interviews to Schedule',  value: stats.interviews_to_schedule,  href: '/candidates', color: stats.interviews_to_schedule  > 0 ? 'text-blue-600'    : 'text-slate-800' },
    { label: 'Overdue Follow-ups',      value: stats.overdue_followups_count, href: '/candidates', color: stats.overdue_followups_count > 0 ? 'text-red-500'     : 'text-emerald-600' },
    { label: 'Pending Offers',          value: stats.pending_offers,          href: '/candidates', color: stats.pending_offers          > 0 ? 'text-violet-600'  : 'text-slate-800' },
    { label: 'Active Candidates',       value: stats.active_candidates,       href: '/candidates', color: 'text-slate-800' },
  ]

  return (
    <aside className="sticky top-0 h-screen w-72 shrink-0 overflow-y-auto border-l border-slate-200 bg-white">
      {/* Activities */}
      <div className="border-b border-slate-100 px-4 pt-5 pb-4">
        <h3 className="mb-3 text-sm font-semibold text-slate-900">Activities</h3>
        <div className="mb-3 flex gap-0 border-b border-slate-100">
          {(['mine', 'all'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`border-b-2 px-3 py-1.5 text-xs font-medium transition-colors ${
                tab === t ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              {t === 'mine' ? 'My Activities' : 'All Activities'}
            </button>
          ))}
        </div>
        <div className="space-y-0.5">
          {STAT_ROWS.map(row => (
            <Link key={row.label} href={row.href}
              className="flex items-center justify-between rounded-lg px-2 py-1.5 hover:bg-slate-50 transition-colors"
            >
              <span className="text-xs text-slate-600">{row.label}</span>
              {row.value !== null
                ? <span className={`text-xs font-semibold ${row.color ?? 'text-slate-800'}`}>{row.value}</span>
                : <ChevronRight className="h-3 w-3 text-slate-300" />
              }
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
              <Link key={item.job_id} href={`/jobs/${item.job_id}`}
                className="flex items-start justify-between gap-2 rounded-lg px-2 py-1.5 hover:bg-slate-50 transition-colors"
              >
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium text-slate-800">{item.job_title}</p>
                  <p className="text-[10px] text-slate-400">Application Review</p>
                </div>
                <div className="shrink-0">
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
          <Link href="/jobs" className="text-[10px] font-medium text-blue-600 hover:text-blue-700 transition-colors">
            View All Jobs
          </Link>
        </div>
        {topJobs.length === 0
          ? <p className="text-xs text-slate-400">No open jobs.</p>
          : (
            <div className="space-y-0.5">
              {topJobs.map(job => (
                <Link key={job.id} href={`/jobs/${job.id}`}
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
                  <span className="shrink-0 text-xs font-semibold text-slate-700">{job.total_candidates}</span>
                </Link>
              ))}
            </div>
          )
        }

        {/* Pipeline mini-bar */}
        {topJobs.length > 0 && topJobs[0].stage_counts.length > 0 && (
          <div className="mt-3 border-t border-slate-100 pt-3">
            <p className="mb-1 text-[10px] text-slate-400">Pipeline — {topJobs[0].position_title}</p>
            <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-slate-100 gap-0.5">
              {topJobs[0].stage_counts.map(s => {
                const pct = topJobs[0].total_candidates > 0 ? (s.count / topJobs[0].total_candidates) * 100 : 0
                if (pct === 0) return null
                return (
                  <div key={s.stage_id} style={{ width: `${pct}%` }}
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

// ── WidgetCustomizer (shown in-place when customizing) ────────────────────────

function WidgetCustomizer({
  activeWidgets,
  onClose,
  onReorder,
  onRemove,
  onAdd,
}: {
  activeWidgets: WidgetId[]
  onClose:   () => void
  onReorder: (widgets: WidgetId[]) => void
  onRemove:  (id: WidgetId) => void
  onAdd:     (id: WidgetId) => void
}) {
  const [draggingId,  setDraggingId]  = useState<WidgetId | null>(null)
  const [dragOverId,  setDragOverId]  = useState<WidgetId | null>(null)

  const availableToAdd = ALL_WIDGET_DEFS.filter(w => !activeWidgets.includes(w.id))

  function handleDragStart(id: WidgetId) {
    setDraggingId(id)
  }

  function handleDragOver(e: React.DragEvent, id: WidgetId) {
    e.preventDefault()
    setDragOverId(id)
  }

  function handleDrop(targetId: WidgetId) {
    if (!draggingId || draggingId === targetId) {
      setDraggingId(null)
      setDragOverId(null)
      return
    }
    const fromIdx = activeWidgets.indexOf(draggingId)
    const toIdx   = activeWidgets.indexOf(targetId)
    const next    = [...activeWidgets]
    next.splice(fromIdx, 1)
    next.splice(toIdx, 0, draggingId)
    onReorder(next)
    setDraggingId(null)
    setDragOverId(null)
  }

  function handleDragEnd() {
    setDraggingId(null)
    setDragOverId(null)
  }

  return (
    <div className="rounded-xl border-2 border-dashed border-blue-200 bg-blue-50/40 p-5">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Customize this view</h3>
          <p className="text-xs text-slate-500">Drag to reorder · click × to remove · add new widgets below</p>
        </div>
        <button
          onClick={onClose}
          className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors"
        >
          <X className="h-3.5 w-3.5" />
          Done
        </button>
      </div>

      {/* Active widgets — drag to reorder */}
      <div className="mb-4 space-y-1.5">
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">Active widgets</p>
        {activeWidgets.map(wId => {
          const def = ALL_WIDGET_DEFS.find(w => w.id === wId)
          if (!def) return null
          const Icon = def.icon
          const isDragging  = draggingId === wId
          const isDragOver  = dragOverId === wId && draggingId !== wId

          return (
            <div
              key={wId}
              draggable
              onDragStart={() => handleDragStart(wId)}
              onDragOver={e => handleDragOver(e, wId)}
              onDrop={() => handleDrop(wId)}
              onDragEnd={handleDragEnd}
              className={`flex items-center gap-3 rounded-lg border bg-white px-3 py-2.5 cursor-grab active:cursor-grabbing transition-all ${
                isDragging  ? 'opacity-40 scale-95 border-blue-300' :
                isDragOver  ? 'border-blue-400 shadow-md ring-1 ring-blue-300 -translate-y-0.5' :
                'border-slate-200 hover:border-slate-300 hover:shadow-sm'
              }`}
            >
              <GripVertical className="h-4 w-4 shrink-0 text-slate-300" />
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-100">
                <Icon className="h-3.5 w-3.5 text-slate-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-800">{def.name}</p>
                <p className="text-xs text-slate-400 truncate">{def.description}</p>
              </div>
              <button
                onClick={() => onRemove(wId)}
                className="shrink-0 rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-500 transition-colors"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )
        })}
        {activeWidgets.length === 0 && (
          <p className="py-4 text-center text-sm text-slate-400">No widgets active. Add one below.</p>
        )}
      </div>

      {/* Available widgets to add */}
      {availableToAdd.length > 0 && (
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">Add widgets</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {availableToAdd.map(def => {
              const Icon = def.icon
              return (
                <button
                  key={def.id}
                  onClick={() => onAdd(def.id)}
                  className="flex items-center gap-2 rounded-lg border border-dashed border-slate-300 bg-white px-3 py-2.5 text-left hover:border-blue-400 hover:bg-blue-50 transition-colors"
                >
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-slate-100">
                    <Icon className="h-3.5 w-3.5 text-slate-500" />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-xs font-medium text-slate-700">{def.name}</p>
                  </div>
                  <Plus className="ml-auto h-3.5 w-3.5 shrink-0 text-slate-400" />
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function DashboardSkeleton() {
  return (
    <div className="flex">
      <aside className="w-48 shrink-0 border-r border-slate-200 bg-white px-3 py-5">
        <div className="mb-3 h-3 w-16 rounded bg-slate-100 animate-pulse" />
        {[...Array(6)].map((_, i) => <div key={i} className="mb-2 h-6 rounded-lg bg-slate-50 animate-pulse" />)}
      </aside>
      <div className="flex-1 px-6 py-4 space-y-4">
        <div className="h-4 w-24 rounded bg-slate-100 animate-pulse" />
        {[...Array(4)].map((_, i) => <div key={i} className="h-10 rounded-lg border bg-slate-50 animate-pulse" />)}
      </div>
      <aside className="w-72 shrink-0 border-l border-slate-200 bg-white px-4 py-5 space-y-3">
        <div className="h-4 w-20 rounded bg-slate-100 animate-pulse" />
        {[...Array(5)].map((_, i) => <div key={i} className="h-6 rounded bg-slate-50 animate-pulse" />)}
      </aside>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { orgId } = useAuth()

  const [data,       setData]       = useState<DashboardData | null>(null)
  const [loading,    setLoading]    = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  // Views
  const [views,        setViews]       = useState<DashView[]>(DEFAULT_VIEWS)
  const [activeViewId, setActiveViewId] = useState('home')
  const [viewEditMode, setViewEditMode] = useState(false)
  const [widgetMode,   setWidgetMode]   = useState(false)
  const [hydrated,     setHydrated]     = useState(false)

  // Hydrate localStorage
  useEffect(() => {
    try {
      const v = localStorage.getItem(LS_VIEWS)
      if (v) setViews(JSON.parse(v))
      const a = localStorage.getItem(LS_ACTIVE)
      if (a) setActiveViewId(a)
    } catch {}
    setHydrated(true)
  }, [])

  useEffect(() => {
    if (!hydrated) return
    try { localStorage.setItem(LS_VIEWS, JSON.stringify(views)) } catch {}
  }, [views, hydrated])

  useEffect(() => {
    if (!hydrated) return
    try { localStorage.setItem(LS_ACTIVE, activeViewId) } catch {}
  }, [activeViewId, hydrated])

  // Fetch
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

  useEffect(() => { if (orgId) fetchData() }, [fetchData, orgId])

  // View management
  function handleAddView() {
    const v: DashView = { id: `view-${Date.now()}`, name: 'New View', icon: 'chart', widgets: ['interviews', 'tasks'] }
    setViews(prev => [...prev, v])
    setActiveViewId(v.id)
    setViewEditMode(true)
  }
  function handleRename(id: string, name: string) {
    setViews(prev => prev.map(v => v.id === id ? { ...v, name } : v))
  }
  function handleDelete(id: string) {
    setViews(prev => {
      const next = prev.filter(v => v.id !== id)
      if (activeViewId === id && next.length > 0) setActiveViewId(next[0].id)
      return next
    })
  }

  // Widget management for the current view
  function updateWidgets(widgets: WidgetId[]) {
    setViews(prev => prev.map(v => v.id === activeViewId ? { ...v, widgets } : v))
  }
  function handleRemoveWidget(id: WidgetId) {
    const view = views.find(v => v.id === activeViewId)
    if (!view) return
    updateWidgets(view.widgets.filter(w => w !== id))
  }
  function handleAddWidget(id: WidgetId) {
    const view = views.find(v => v.id === activeViewId)
    if (!view) return
    updateWidgets([...view.widgets, id])
  }

  if (loading || !hydrated) return <DashboardSkeleton />

  if (!data) {
    return (
      <div className="flex items-center justify-center p-16 text-sm text-slate-400">
        Failed to load.{' '}
        <button onClick={() => fetchData()} className="ml-2 text-blue-500 underline">Retry</button>
      </div>
    )
  }

  const activeView = views.find(v => v.id === activeViewId) ?? views[0]
  const ActiveIcon = VIEW_ICONS[activeView?.icon ?? 'home'] ?? Home

  return (
    <div className="flex bg-white">

      {/* Views sidebar */}
      <ViewsSidebar
        views={views}
        activeId={activeViewId}
        editMode={viewEditMode}
        onSelect={id => { setActiveViewId(id); setWidgetMode(false) }}
        onToggleEdit={() => setViewEditMode(p => !p)}
        onAdd={handleAddView}
        onRename={handleRename}
        onDelete={handleDelete}
      />

      {/* Center main */}
      <div className="flex-1 min-w-0 divide-y divide-slate-100">

        {/* View header */}
        <div className="flex items-center justify-between px-6 py-3 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <ActiveIcon className="h-4 w-4 text-slate-500" />
            <span className="text-sm font-semibold text-slate-800">{activeView?.name}</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setWidgetMode(p => !p)}
              className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                widgetMode
                  ? 'border-blue-300 bg-blue-50 text-blue-700'
                  : 'border-slate-200 text-slate-500 hover:bg-slate-50'
              }`}
            >
              <Settings2 className="h-3 w-3" />
              Customize
            </button>
            <button
              onClick={() => fetchData(true)}
              disabled={refreshing}
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-500 hover:bg-slate-50 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`h-3 w-3 ${refreshing ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>

        {/* Widget area */}
        <div className="p-6 space-y-8">
          {/* Customize panel */}
          {widgetMode && (
            <WidgetCustomizer
              activeWidgets={activeView?.widgets ?? []}
              onClose={() => setWidgetMode(false)}
              onReorder={updateWidgets}
              onRemove={handleRemoveWidget}
              onAdd={handleAddWidget}
            />
          )}

          {/* Render widgets in order */}
          {(activeView?.widgets ?? []).map(wId => (
            <div key={wId} className={widgetMode ? 'opacity-50 pointer-events-none' : ''}>
              {wId === 'interviews'    && <InterviewsWidget    interviews={data.upcoming_interviews} />}
              {wId === 'tasks'         && <TasksWidget         tasks={data.tasks} />}
              {wId === 'overview_stats'&& <OverviewStatsWidget stats={data.stats} />}
              {wId === 'pipeline'      && <PipelineWidget      breakdown={data.candidate_breakdown} />}
              {wId === 'jobs_mini'     && <JobsMiniWidget      jobs={data.top_jobs} />}
            </div>
          ))}

          {(activeView?.widgets ?? []).length === 0 && !widgetMode && (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <Settings2 className="mb-3 h-8 w-8 text-slate-300" />
              <p className="text-sm font-medium text-slate-600">This view has no widgets yet</p>
              <p className="mt-1 text-xs text-slate-400">Click <strong>Customize</strong> above to add some</p>
            </div>
          )}
        </div>
      </div>

      {/* Right activity panel */}
      <ActivityPanel
        stats={data.stats}
        applicationReview={data.application_review}
        topJobs={data.top_jobs}
      />
    </div>
  )
}
