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
  MapPin,
  CheckSquare,
  MessageSquare,
  Bell,
  Workflow,
  RefreshCw,
  Video,
  GripVertical,
  X,
  Settings2,
  Briefcase,
  UserCheck,
  Activity,
  Building2,
  UserCog,
  Clock,
  Award,
  PieChart,
  Send,
  Zap,
  TrendingUp,
  Search,
} from 'lucide-react'
import type { StageColor } from '@/lib/types/database'
import { CandidateDrawer } from '@/components/dashboard/CandidateDrawer'

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
interface RecentApplication {
  id: string; candidate_id: string; candidate_name: string
  job_title: string; stage_name: string | null
  applied_at: string; source: string; ai_score: number | null
}
interface TopScored {
  id: string; candidate_id: string; candidate_name: string
  job_title: string; ai_score: number; ai_recommendation: string | null
}
interface CandidateSource { source: string; count: number }
interface OfferTrackerItem {
  candidate_id: string; candidate_name: string
  current_title: string | null; job_title: string
}
interface JobByDept { department: string; job_count: number; candidate_count: number }
interface StageFunnelItem { stage_id: string; stage_name: string; color: StageColor; count: number }
interface RecentEvent {
  id: string; event_type: string; candidate_name: string
  job_title: string; to_stage: string | null; note: string | null; created_at: string
}

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
  recent_activity: RecentEvent[]
  recent_applications: RecentApplication[]
  top_scored: TopScored[]
  candidate_sources: CandidateSource[]
  offer_tracker: OfferTrackerItem[]
  jobs_by_dept: JobByDept[]
  stage_funnel: StageFunnelItem[]
}

// ── Widget definitions ─────────────────────────────────────────────────────────

type WidgetId =
  | 'interviews' | 'tasks' | 'overview_stats' | 'pipeline' | 'jobs_mini'
  | 'jobs_by_dept' | 'hm_actions'
  | 'recent_applications' | 'top_scored' | 'candidate_sources' | 'offer_tracker'
  | 'recent_activity' | 'stage_funnel' | 'action_queue'

type WidgetCategory = 'jobs' | 'candidates' | 'activity'

interface WidgetDef {
  id:          WidgetId
  name:        string
  description: string
  icon:        React.FC<{ className?: string }>
  category:    WidgetCategory
}

const ALL_WIDGET_DEFS: WidgetDef[] = [
  // ── Jobs ──
  { id: 'jobs_mini',           category: 'jobs',       name: 'Active Jobs',         icon: Briefcase,   description: 'Open roles with per-stage candidate counts' },
  { id: 'jobs_by_dept',        category: 'jobs',       name: 'Jobs by Department',  icon: Building2,   description: 'Job and candidate count grouped by department' },
  { id: 'hm_actions',          category: 'jobs',       name: 'HM Actions',          icon: UserCog,     description: 'JDs awaiting hiring manager approval to post' },
  // ── Candidates ──
  { id: 'overview_stats',      category: 'candidates', name: 'Overview Stats',      icon: BarChart2,   description: 'Open jobs, active candidates, offers, hires' },
  { id: 'pipeline',            category: 'candidates', name: 'Pipeline Overview',   icon: Layers,      description: 'Candidate status breakdown across all roles' },
  { id: 'recent_applications', category: 'candidates', name: 'Recent Applications', icon: Clock,       description: 'Most recently submitted applications' },
  { id: 'top_scored',          category: 'candidates', name: 'Top AI-Scored',       icon: Award,       description: 'Highest AI-scored candidates across all roles' },
  { id: 'candidate_sources',   category: 'candidates', name: 'Candidate Sources',   icon: PieChart,    description: 'Breakdown by application source (applied, sourced…)' },
  { id: 'offer_tracker',       category: 'candidates', name: 'Offer Tracker',       icon: Send,        description: 'Candidates currently at the offer stage' },
  // ── Activity ──
  { id: 'interviews',          category: 'activity',   name: 'Interviews',          icon: Video,       description: 'Candidates currently in interview stages' },
  { id: 'tasks',               category: 'activity',   name: 'Tasks',               icon: CheckSquare, description: 'Approvals, feedback, and overdue follow-ups' },
  { id: 'recent_activity',     category: 'activity',   name: 'Recent Activity',     icon: Zap,         description: 'Latest events across candidates and jobs' },
  { id: 'stage_funnel',        category: 'activity',   name: 'Stage Funnel',        icon: TrendingUp,  description: 'Active candidates broken down by pipeline stage' },
  { id: 'action_queue',        category: 'activity',   name: 'Action Queue',        icon: Zap,         description: 'Auto-populated daily action items with one-click resolution' },
]

const CATEGORY_LABELS: Record<WidgetCategory, string> = {
  jobs: 'Jobs', candidates: 'Candidates', activity: 'Activity',
}

// ── Widget card accent colours (top border per category) ──────────────────────

const CATEGORY_ACCENT: Record<WidgetCategory, { border: string; icon: string; iconText: string; label: string }> = {
  jobs:       { border: 'border-t-blue-400',   icon: 'bg-blue-100',   iconText: 'text-blue-600',   label: 'bg-blue-50 text-blue-700' },
  candidates: { border: 'border-t-violet-400', icon: 'bg-violet-100', iconText: 'text-violet-600', label: 'bg-violet-50 text-violet-700' },
  activity:   { border: 'border-t-amber-400',  icon: 'bg-amber-100',  iconText: 'text-amber-600',  label: 'bg-amber-50 text-amber-700' },
}

function widgetAccent(wId: WidgetId) {
  const cat = ALL_WIDGET_DEFS.find(w => w.id === wId)?.category ?? 'activity'
  return CATEGORY_ACCENT[cat]
}

// ── View type & defaults ──────────────────────────────────────────────────────

type WidgetSize = 'small' | 'wide' | 'tall' | 'large'

interface DashView {
  id: string; name: string; icon: string; widgets: WidgetId[]
  widgetSizes?: Partial<Record<WidgetId, WidgetSize>>
}

const DEFAULT_VIEWS: DashView[] = [
  { id: 'home',      name: 'Home',                icon: 'home',     widgets: ['interviews', 'tasks'] },
  { id: 'recruiter', name: 'Recruiter Dashboard', icon: 'chart',    widgets: ['interviews', 'tasks', 'overview_stats'] },
  { id: 'exec',      name: 'Exec Review',         icon: 'eye',      widgets: ['interviews', 'tasks', 'overview_stats', 'pipeline'] },
  { id: 'dept',      name: 'Department View',     icon: 'layers',   widgets: ['interviews', 'tasks', 'overview_stats', 'jobs_mini', 'pipeline'] },
  { id: 'pipeline',  name: 'Pipeline View',       icon: 'workflow', widgets: ['interviews', 'tasks', 'pipeline', 'overview_stats'] },
  { id: 'data',      name: 'Data Quality',        icon: 'shield',   widgets: ['interviews', 'tasks', 'pipeline'] },
]

const VIEW_ICONS: Record<string, React.FC<{ className?: string }>> = {
  home: Home, chart: BarChart2, eye: Eye, layers: Layers,
  workflow: Workflow, shield: Shield, users: Users, star: Star, bar: BarChart,
}

const LS_VIEWS         = 'rs_dashboard_views'
const LS_ACTIVE        = 'rs_dashboard_active_view'
const LS_VERSION       = 'rs_dashboard_version'
const LS_RIGHT_WIDGETS = 'rs_right_panel_widgets'
const CURRENT_VERSION  = 'v4' // bump when DashView shape changes

// ── Right Panel Widget defaults ─────────────────────────────────────────────────
// The right panel uses the same WidgetId type and ALL_WIDGET_DEFS as the main area.
const DEFAULT_RIGHT_WIDGETS: WidgetId[] = ['tasks', 'recent_applications', 'jobs_mini']

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

const PREVIEW_LIMIT = 4

/** Per-widget search state + filter helper */
function useWidgetSearch() {
  const [showSearch, setShowSearch] = useState(false)
  const [query,      setQuery]      = useState('')
  function toggle() { setShowSearch(p => !p); setQuery('') }
  function filterFn<T>(items: T[], getFields: (item: T) => string[]): T[] {
    if (!query.trim()) return items
    const q = query.toLowerCase()
    return items.filter(item => getFields(item).some(f => f.toLowerCase().includes(q)))
  }
  return { showSearch, query, setQuery, toggle, filterFn }
}

/** Shared coloured header row for every widget */
function WidgetHeader({
  wId, title, badge, href, searchable,
  showSearch, onToggleSearch, query, onQueryChange,
}: {
  wId:             WidgetId
  title:           string
  badge?:          number | null
  href?:           string
  searchable?:     boolean
  showSearch?:     boolean
  onToggleSearch?: () => void
  query?:          string
  onQueryChange?:  (q: string) => void
}) {
  const def    = ALL_WIDGET_DEFS.find(w => w.id === wId)
  const accent = widgetAccent(wId)
  const Icon   = def?.icon
  return (
    <div className="mb-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {Icon && (
            <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${accent.icon}`}>
              <Icon className={`h-3.5 w-3.5 ${accent.iconText}`} />
            </div>
          )}
          <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
          {badge != null && badge > 0 && (
            <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${accent.label}`}>{badge}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {searchable && onToggleSearch && (
            <button
              onClick={onToggleSearch}
              title="Search"
              className={`flex items-center justify-center rounded p-0.5 transition-colors ${
                showSearch ? 'text-blue-500' : 'text-slate-300 hover:text-slate-500'
              }`}
            >
              <Search className="h-3.5 w-3.5" />
            </button>
          )}
          {href && (
            <Link href={href} className="text-xs font-medium text-slate-400 hover:text-blue-600 transition-colors">
              View all →
            </Link>
          )}
        </div>
      </div>
      {showSearch && onQueryChange && (
        <div className="mt-2 flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 focus-within:border-blue-300 focus-within:ring-1 focus-within:ring-blue-100 transition-all">
          <Search className="h-3 w-3 shrink-0 text-slate-400" />
          <input
            autoFocus
            type="text"
            value={query ?? ''}
            onChange={e => onQueryChange(e.target.value)}
            placeholder={`Search ${title.toLowerCase()}…`}
            className="flex-1 min-w-0 bg-transparent text-xs text-slate-700 placeholder-slate-400 outline-none"
          />
          {query && (
            <button onClick={() => onQueryChange('')} className="shrink-0 text-slate-300 hover:text-slate-500 transition-colors">
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function InterviewsWidget({ interviews, onCandidateClick }: { interviews: UpcomingInterview[]; onCandidateClick: (id: string) => void }) {
  const { showSearch, query, setQuery, toggle, filterFn } = useWidgetSearch()
  const filtered  = filterFn(interviews, iv => [iv.candidate_name, iv.job_title, iv.stage_name])
  const preview   = filtered.slice(0, PREVIEW_LIMIT)
  const remaining = filtered.length - preview.length
  return (
    <div>
      <WidgetHeader wId="interviews" title="Interviews" badge={interviews.length} href="/candidates"
        searchable showSearch={showSearch} onToggleSearch={toggle} query={query} onQueryChange={setQuery} />

      <div className="grid grid-cols-[2fr_2fr_1.2fr_1fr] gap-3 border-b border-slate-100 pb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
        <span>Stage</span><span>Candidate</span><span>Date</span><span>Role</span>
      </div>

      {interviews.length === 0 ? (
        <div className="py-6 text-center text-xs text-slate-400">
          No upcoming interviews.{' '}
          <Link href="/candidates" className="text-blue-500 hover:underline">View candidates</Link>
        </div>
      ) : (
        <>
          {preview.map(iv => (
            <button
              key={iv.id}
              onClick={() => onCandidateClick(iv.candidate_id)}
              className="grid w-full grid-cols-[2fr_2fr_1.2fr_1fr] items-center gap-3 rounded-sm border-b border-slate-50 py-2 hover:bg-slate-50 transition-colors text-left"
            >
              <div className="min-w-0">
                <p className="truncate text-xs font-medium text-slate-800">{iv.stage_name}</p>
                <div className="mt-0.5 flex items-center gap-1">
                  <Video className="h-2.5 w-2.5 text-slate-400" />
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
              <span className="inline-block rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">
                Interviewer
              </span>
            </button>
          ))}
          {remaining > 0 && (
            <Link href="/candidates" className="mt-2 flex items-center justify-center gap-1 rounded-lg border border-dashed border-slate-200 py-2 text-xs text-slate-400 hover:border-blue-300 hover:text-blue-600 transition-colors">
              +{remaining} more interview{remaining !== 1 ? 's' : ''} →
            </Link>
          )}
        </>
      )}
    </div>
  )
}

type TaskTab = 'all' | 'approvals' | 'feedback' | 'followups' | 'mentions' | 'sequences'

function TasksWidget({ tasks, onCandidateClick, onRefresh }: { tasks: DashboardData['tasks']; onCandidateClick: (id: string) => void; onRefresh?: () => void }) {
  const [actioningId, setActioningId] = useState<string | null>(null)
  const [actionResult, setActionResult] = useState<{ id: string; msg: string } | null>(null)

  async function handleApprove(jobId: string) {
    setActioningId(jobId)
    try {
      await fetch(`/api/hiring-requests/${jobId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'posted' }),
      })
      setActionResult({ id: jobId, msg: 'Approved & posted!' })
      setTimeout(() => { setActionResult(null); onRefresh?.() }, 1500)
    } finally {
      setActioningId(null)
    }
  }

  async function handleMarkFollowupDone(applicationId: string) {
    setActioningId(applicationId)
    try {
      await fetch(`/api/applications/${applicationId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: 'Follow-up completed', created_by: 'Recruiter' }),
      })
      setActionResult({ id: applicationId, msg: 'Marked done!' })
      setTimeout(() => { setActionResult(null); onRefresh?.() }, 1500)
    } finally {
      setActioningId(null)
    }
  }

  const { showSearch, query, setQuery, toggle, filterFn } = useWidgetSearch()
  const [activeTab, setActiveTab] = useState<TaskTab>('all')
  const counts = {
    approvals: tasks.pending_approvals.length,
    feedback:  tasks.feedback_needed.length,
    followups: tasks.overdue_followups.length,
  }
  const totalAll = counts.approvals + counts.feedback + counts.followups

  // Flatten all items for the compact preview
  const allItems: { type: 'approval' | 'feedback' | 'followup'; id: string; candidateId: string | null; title: string; sub: string; href: string; time: string; color: string; icon: React.ReactNode }[] = [
    ...tasks.pending_approvals.map(t => ({
      type: 'approval' as const,
      id: t.id, candidateId: null, title: t.title, href: `/jobs/${t.id}`,
      sub: `${t.department ?? 'No dept'}${t.location ? ` · ${t.location}` : ''}`,
      time: timeAgo(t.created_at), color: 'bg-emerald-100 text-emerald-600',
      icon: <CheckSquare className="h-3 w-3" />,
    })),
    ...tasks.feedback_needed.map(t => ({
      type: 'feedback' as const,
      id: t.id, candidateId: t.candidate_id, title: t.candidate_name, href: `/candidates/${t.candidate_id}`,
      sub: `Feedback · ${t.job_title}`,
      time: timeAgo(t.moved_at), color: 'bg-amber-100 text-amber-600',
      icon: <MessageSquare className="h-3 w-3" />,
    })),
    ...tasks.overdue_followups.map(t => ({
      type: 'followup' as const,
      id: t.id, candidateId: t.candidate_id, title: t.candidate_name, href: `/candidates/${t.candidate_id}`,
      sub: `Follow-up · ${t.job_title}`,
      time: timeAgo(t.last_event_at), color: 'bg-red-100 text-red-500',
      icon: <Bell className="h-3 w-3" />,
    })),
  ]

  const TABS: { key: TaskTab; label: string; count?: number }[] = [
    { key: 'all',       label: 'All',       count: totalAll },
    { key: 'approvals', label: 'Approvals', count: counts.approvals },
    { key: 'feedback',  label: 'Feedback',  count: counts.feedback  },
    { key: 'followups', label: 'Followups', count: counts.followups },
    { key: 'mentions',  label: 'Mentions',  count: 0 },
    { key: 'sequences', label: 'Sequences', count: 0 },
  ]

  // Which items to show for current tab
  const tabItems = activeTab === 'all' ? allItems
    : activeTab === 'approvals' ? allItems.filter(i => i.type === 'approval')
    : activeTab === 'feedback'  ? allItems.filter(i => i.type === 'feedback')
    : activeTab === 'followups' ? allItems.filter(i => i.type === 'followup')
    : []

  const filteredTabItems = filterFn(tabItems, item => [item.title, item.sub])
  const preview          = filteredTabItems.slice(0, PREVIEW_LIMIT)
  const remaining        = filteredTabItems.length - preview.length

  return (
    <div>
      <WidgetHeader wId="tasks" title="Tasks" badge={totalAll} href="/candidates"
        searchable showSearch={showSearch} onToggleSearch={toggle} query={query} onQueryChange={setQuery} />

      <div className="flex gap-0 border-b border-slate-100 mb-3 -mx-1 overflow-x-auto">
        {TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex shrink-0 items-center gap-1 border-b-2 px-2.5 py-1.5 text-[11px] font-medium transition-colors ${
              activeTab === tab.key ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-400 hover:text-slate-700'
            }`}
          >
            {tab.label}
            {tab.count !== undefined && tab.count > 0 && (
              <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold leading-none ${
                activeTab === tab.key ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500'
              }`}>{tab.count}</span>
            )}
          </button>
        ))}
      </div>

      {preview.length === 0 ? (
        <p className="py-5 text-center text-xs text-slate-400">
          {activeTab === 'mentions' ? 'No mentions' : activeTab === 'sequences' ? 'No active sequences' : 'All caught up!'}
        </p>
      ) : (
        <div className="space-y-0.5">
          {preview.map(item => {
            const resultMsg = actionResult?.id === item.id ? actionResult.msg : null

            if (resultMsg) {
              return (
                <div key={`${item.type}-${item.id}`} className="flex items-center gap-2.5 rounded-lg bg-emerald-50 px-2 py-2 text-xs text-emerald-700">
                  <CheckSquare className="h-3.5 w-3.5" /> {resultMsg}
                </div>
              )
            }

            const actionBtn = item.type === 'approval' ? (
              <button
                onClick={(e) => { e.stopPropagation(); handleApprove(item.id) }}
                disabled={actioningId === item.id}
                className="shrink-0 rounded bg-emerald-500 px-2 py-0.5 text-[10px] font-medium text-white hover:bg-emerald-600 disabled:opacity-50 transition-colors"
              >
                {actioningId === item.id ? '...' : 'Approve'}
              </button>
            ) : item.type === 'followup' ? (
              <button
                onClick={(e) => { e.stopPropagation(); handleMarkFollowupDone(item.id) }}
                disabled={actioningId === item.id}
                className="shrink-0 rounded bg-slate-500 px-2 py-0.5 text-[10px] font-medium text-white hover:bg-slate-600 disabled:opacity-50 transition-colors"
              >
                {actioningId === item.id ? '...' : 'Done'}
              </button>
            ) : null

            const inner = (
              <>
                <div className={`flex h-5 w-5 shrink-0 items-center justify-center rounded ${item.color}`}>
                  {item.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-slate-800 truncate">{item.title}</p>
                  <p className="text-[10px] text-slate-400 truncate">{item.sub}</p>
                </div>
                <span className="shrink-0 text-[10px] text-slate-400">{item.time}</span>
                {actionBtn}
              </>
            )
            return item.candidateId ? (
              <button key={`${item.type}-${item.id}`} onClick={() => onCandidateClick(item.candidateId!)}
                className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 hover:bg-slate-50 transition-colors text-left"
              >
                {inner}
              </button>
            ) : (
              <Link key={`${item.type}-${item.id}`} href={item.href}
                className="flex items-center gap-2.5 rounded-lg px-2 py-2 hover:bg-slate-50 transition-colors"
              >
                {inner}
              </Link>
            )
          })}
          {remaining > 0 && (
            <Link href="/candidates" className="mt-1 flex items-center justify-center gap-1 rounded-lg border border-dashed border-slate-200 py-2 text-xs text-slate-400 hover:border-blue-300 hover:text-blue-600 transition-colors">
              +{remaining} more task{remaining !== 1 ? 's' : ''} →
            </Link>
          )}
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
      <WidgetHeader wId="overview_stats" title="Overview" />
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {CARDS.map(card => {
          const Icon = card.icon
          return (
            <Link key={card.label} href={card.href}
              className={`flex items-center gap-2.5 rounded-xl border px-3 py-2.5 transition-all hover:-translate-y-0.5 hover:shadow-sm ${card.color}`}
            >
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/60">
                <Icon className="h-3.5 w-3.5" />
              </div>
              <div>
                <p className="text-lg font-bold leading-tight">{card.value}</p>
                <p className="text-[10px] font-medium opacity-70 leading-tight">{card.label}</p>
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
      <WidgetHeader wId="pipeline" title="Pipeline Overview" />
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
  const { showSearch, query, setQuery, toggle, filterFn } = useWidgetSearch()
  const filtered  = filterFn(jobs, j => [j.position_title, j.department ?? '', j.location ?? ''])
  const preview   = filtered.slice(0, PREVIEW_LIMIT)
  const remaining = filtered.length - preview.length
  return (
    <div>
      <WidgetHeader wId="jobs_mini" title="Active Jobs" badge={jobs.length} href="/jobs"
        searchable showSearch={showSearch} onToggleSearch={toggle} query={query} onQueryChange={setQuery} />
      {jobs.length === 0 ? (
        <p className="text-xs text-slate-400">No open jobs. <Link href="/jobs" className="text-blue-500 hover:underline">Create one</Link></p>
      ) : (
        <div className="space-y-1">
          {preview.map(job => (
            <Link key={job.id} href={`/jobs/${job.id}`}
              className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 hover:bg-slate-100 transition-colors"
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
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-slate-700">{job.total_candidates}</span>
                <div className="flex h-4 w-14 overflow-hidden rounded-full bg-slate-200 gap-px">
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
          {remaining > 0 && (
            <Link href="/jobs" className="flex items-center justify-center gap-1 rounded-lg border border-dashed border-slate-200 py-2 text-xs text-slate-400 hover:border-blue-300 hover:text-blue-600 transition-colors">
              +{remaining} more job{remaining !== 1 ? 's' : ''} →
            </Link>
          )}
        </div>
      )}
    </div>
  )
}

// ── Source / recommendation config (shared by multiple widgets) ───────────────

const SOURCE_LABELS: Record<string, string> = {
  manual: 'Manual', applied: 'Applied', imported: 'Import',
  sourced: 'Sourced', referral: 'Referral',
}
const SOURCE_COLORS: Record<string, string> = {
  manual: 'bg-slate-400', applied: 'bg-blue-500', imported: 'bg-violet-500',
  sourced: 'bg-emerald-500', referral: 'bg-amber-400',
}
const RECO_CONFIG: Record<string, { label: string; bg: string; text: string }> = {
  strong_yes: { label: 'Strong Yes', bg: 'bg-emerald-100', text: 'text-emerald-700' },
  yes:        { label: 'Yes',        bg: 'bg-blue-100',    text: 'text-blue-700' },
  maybe:      { label: 'Maybe',      bg: 'bg-amber-100',   text: 'text-amber-700' },
  no:         { label: 'No',         bg: 'bg-red-100',     text: 'text-red-600' },
}

// ── JobsByDeptWidget ──────────────────────────────────────────────────────────

function JobsByDeptWidget({ departments }: { departments: JobByDept[] }) {
  const { showSearch, query, setQuery, toggle, filterFn } = useWidgetSearch()
  const filtered  = filterFn(departments, d => [d.department])
  const preview   = filtered.slice(0, PREVIEW_LIMIT)
  const remaining = filtered.length - preview.length
  const max = Math.max(...departments.map(d => d.candidate_count), 1)
  return (
    <div>
      <WidgetHeader wId="jobs_by_dept" title="Jobs by Department" href="/jobs"
        searchable showSearch={showSearch} onToggleSearch={toggle} query={query} onQueryChange={setQuery} />
      {departments.length === 0 ? (
        <p className="text-xs text-slate-400">No department data yet.</p>
      ) : (
        <div className="space-y-2.5">
          {preview.map(d => (
            <div key={d.department}>
              <div className="mb-1 flex items-center justify-between text-xs">
                <span className="font-medium text-slate-700 truncate">{d.department}</span>
                <span className="shrink-0 ml-2 text-[10px] text-slate-400">
                  {d.job_count} job{d.job_count !== 1 ? 's' : ''} · {d.candidate_count}
                </span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-blue-500 transition-all"
                  style={{ width: `${(d.candidate_count / max) * 100}%` }}
                />
              </div>
            </div>
          ))}
          {remaining > 0 && (
            <Link href="/jobs" className="flex items-center justify-center gap-1 rounded-lg border border-dashed border-slate-200 py-2 text-xs text-slate-400 hover:border-blue-300 hover:text-blue-600 transition-colors">
              +{remaining} more department{remaining !== 1 ? 's' : ''} →
            </Link>
          )}
        </div>
      )}
    </div>
  )
}

// ── HmActionsWidget ───────────────────────────────────────────────────────────

function HmActionsWidget({ approvals }: { approvals: TaskApproval[] }) {
  const { showSearch, query, setQuery, toggle, filterFn } = useWidgetSearch()
  const filtered  = filterFn(approvals, a => [a.title, a.department ?? '', a.location ?? ''])
  const preview   = filtered.slice(0, PREVIEW_LIMIT)
  const remaining = filtered.length - preview.length
  return (
    <div>
      <WidgetHeader wId="hm_actions" title="HM Actions" badge={approvals.length} href="/jobs"
        searchable showSearch={showSearch} onToggleSearch={toggle} query={query} onQueryChange={setQuery} />
      {approvals.length === 0 ? (
        <p className="text-xs text-slate-400">No pending HM actions — all JDs are live or in progress.</p>
      ) : (
        <div className="space-y-1.5">
          {preview.map(a => (
            <Link key={a.id} href={`/jobs/${a.id}`}
              className="flex items-center justify-between gap-3 rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 hover:bg-amber-100 transition-colors"
            >
              <div className="min-w-0">
                <p className="truncate text-xs font-medium text-slate-800">{a.title}</p>
                <p className="text-[10px] text-slate-500">{a.department ?? 'No department'} · JD ready to post</p>
              </div>
              <span className="shrink-0 rounded-full border border-amber-200 bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
                Approval
              </span>
            </Link>
          ))}
          {remaining > 0 && (
            <Link href="/jobs" className="flex items-center justify-center gap-1 rounded-lg border border-dashed border-slate-200 py-2 text-xs text-slate-400 hover:border-blue-300 hover:text-blue-600 transition-colors">
              +{remaining} more action{remaining !== 1 ? 's' : ''} →
            </Link>
          )}
        </div>
      )}
    </div>
  )
}

// ── RecentApplicationsWidget ──────────────────────────────────────────────────

function RecentApplicationsWidget({ applications, onCandidateClick }: { applications: RecentApplication[]; onCandidateClick: (id: string) => void }) {
  const { showSearch, query, setQuery, toggle, filterFn } = useWidgetSearch()
  const filtered  = filterFn(applications, a => [a.candidate_name, a.job_title, a.stage_name ?? '', a.source])
  const preview   = filtered.slice(0, PREVIEW_LIMIT)
  const remaining = filtered.length - preview.length
  return (
    <div>
      <WidgetHeader wId="recent_applications" title="Recent Applications" badge={applications.length} href="/candidates"
        searchable showSearch={showSearch} onToggleSearch={toggle} query={query} onQueryChange={setQuery} />
      {applications.length === 0 ? (
        <p className="text-xs text-slate-400">No applications yet.</p>
      ) : (
        <div className="space-y-0">
          {preview.map(a => (
            <button key={a.id} onClick={() => onCandidateClick(a.candidate_id)}
              className="flex w-full items-center gap-3 rounded-lg border-b border-slate-50 px-1 py-2 hover:bg-slate-50 transition-colors text-left"
            >
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-100 text-[10px] font-bold text-blue-600">
                {a.candidate_name.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="truncate text-xs font-medium text-slate-800">{a.candidate_name}</p>
                <p className="truncate text-[10px] text-slate-400">
                  {a.job_title}{a.stage_name ? ` · ${a.stage_name}` : ''}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-[10px] text-slate-400">{timeAgo(a.applied_at)}</p>
                <span className="text-[10px] text-slate-500">{SOURCE_LABELS[a.source] ?? a.source}</span>
              </div>
              {a.ai_score !== null && (
                <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                  a.ai_score >= 80 ? 'bg-emerald-100 text-emerald-700' :
                  a.ai_score >= 60 ? 'bg-amber-100 text-amber-700' :
                  'bg-slate-100 text-slate-600'
                }`}>{a.ai_score}</span>
              )}
            </button>
          ))}
          {remaining > 0 && (
            <Link href="/candidates" className="mt-1 flex items-center justify-center gap-1 rounded-lg border border-dashed border-slate-200 py-2 text-xs text-slate-400 hover:border-blue-300 hover:text-blue-600 transition-colors">
              +{remaining} more application{remaining !== 1 ? 's' : ''} →
            </Link>
          )}
        </div>
      )}
    </div>
  )
}

// ── TopScoredWidget ───────────────────────────────────────────────────────────

function TopScoredWidget({ candidates, onCandidateClick }: { candidates: TopScored[]; onCandidateClick: (id: string) => void }) {
  const { showSearch, query, setQuery, toggle, filterFn } = useWidgetSearch()
  const filtered  = filterFn(candidates, c => [c.candidate_name, c.job_title])
  const preview   = filtered.slice(0, PREVIEW_LIMIT)
  const remaining = filtered.length - preview.length
  return (
    <div>
      <WidgetHeader wId="top_scored" title="Top AI-Scored" href="/candidates"
        searchable showSearch={showSearch} onToggleSearch={toggle} query={query} onQueryChange={setQuery} />
      {candidates.length === 0 ? (
        <p className="text-xs text-slate-400">No AI scores yet — candidates are scored automatically when added.</p>
      ) : (
        <div className="space-y-1">
          {preview.map((c, idx) => {
            const reco = RECO_CONFIG[c.ai_recommendation ?? '']
            return (
              <button key={c.id} onClick={() => onCandidateClick(c.candidate_id)}
                className="flex w-full items-center gap-2.5 rounded-lg border border-slate-100 bg-slate-50 px-2.5 py-2 hover:bg-slate-100 transition-colors text-left"
              >
                <span className="w-4 shrink-0 text-center text-[10px] font-bold text-slate-400">#{idx + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="truncate text-xs font-medium text-slate-800">{c.candidate_name}</p>
                  <p className="truncate text-[10px] text-slate-400">{c.job_title}</p>
                </div>
                {reco && (
                  <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${reco.bg} ${reco.text}`}>
                    {reco.label}
                  </span>
                )}
                <div className={`shrink-0 flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-bold ${
                  c.ai_score >= 80 ? 'bg-emerald-100 text-emerald-700' :
                  c.ai_score >= 60 ? 'bg-amber-100 text-amber-700' :
                  'bg-slate-100 text-slate-600'
                }`}>
                  {c.ai_score}
                </div>
              </button>
            )
          })}
          {remaining > 0 && (
            <Link href="/candidates" className="mt-1 flex items-center justify-center gap-1 rounded-lg border border-dashed border-slate-200 py-2 text-xs text-slate-400 hover:border-blue-300 hover:text-blue-600 transition-colors">
              +{remaining} more candidate{remaining !== 1 ? 's' : ''} →
            </Link>
          )}
        </div>
      )}
    </div>
  )
}

// ── CandidateSourcesWidget ────────────────────────────────────────────────────

function CandidateSourcesWidget({ sources }: { sources: CandidateSource[] }) {
  const total = sources.reduce((s, x) => s + x.count, 0)
  return (
    <div>
      <WidgetHeader wId="candidate_sources" title="Candidate Sources" />
      {total === 0 ? (
        <p className="text-sm text-slate-400">No source data yet.</p>
      ) : (
        <div className="space-y-3">
          <div className="flex h-3 w-full overflow-hidden rounded-full gap-0.5">
            {sources.map(s => (
              <div
                key={s.source}
                style={{ width: `${(s.count / total) * 100}%` }}
                className={`h-full ${SOURCE_COLORS[s.source] ?? 'bg-slate-300'}`}
                title={`${SOURCE_LABELS[s.source] ?? s.source}: ${s.count}`}
              />
            ))}
          </div>
          <div className="space-y-1.5">
            {sources.map(s => (
              <div key={s.source} className="flex items-center gap-2">
                <div className={`h-2 w-2 shrink-0 rounded-full ${SOURCE_COLORS[s.source] ?? 'bg-slate-300'}`} />
                <span className="flex-1 text-xs text-slate-600">{SOURCE_LABELS[s.source] ?? s.source}</span>
                <span className="text-xs font-semibold text-slate-700">{s.count}</span>
                <span className="w-8 text-right text-[10px] text-slate-400">
                  {Math.round((s.count / total) * 100)}%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── OfferTrackerWidget ────────────────────────────────────────────────────────

function OfferTrackerWidget({ offers, onCandidateClick }: { offers: OfferTrackerItem[]; onCandidateClick: (id: string) => void }) {
  const { showSearch, query, setQuery, toggle, filterFn } = useWidgetSearch()
  const filtered  = filterFn(offers, o => [o.candidate_name, o.job_title, o.current_title ?? ''])
  const preview   = filtered.slice(0, PREVIEW_LIMIT)
  const remaining = filtered.length - preview.length
  return (
    <div>
      <WidgetHeader wId="offer_tracker" title="Offer Tracker" badge={offers.length} href="/candidates"
        searchable showSearch={showSearch} onToggleSearch={toggle} query={query} onQueryChange={setQuery} />
      {offers.length === 0 ? (
        <p className="text-xs text-slate-400">No candidates at the offer stage right now.</p>
      ) : (
        <div className="space-y-1.5">
          {preview.map(o => (
            <button key={o.candidate_id} onClick={() => onCandidateClick(o.candidate_id)}
              className="flex w-full items-center gap-2.5 rounded-lg border border-violet-100 bg-violet-50 px-2.5 py-2 hover:bg-violet-100 transition-colors text-left"
            >
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-violet-200 text-[10px] font-bold text-violet-700">
                {o.candidate_name.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="truncate text-xs font-medium text-slate-800">{o.candidate_name}</p>
                <p className="truncate text-[10px] text-slate-500">{o.job_title}{o.current_title ? ` · ${o.current_title}` : ''}</p>
              </div>
              <span className="shrink-0 rounded-full border border-violet-200 bg-violet-100 px-1.5 py-0.5 text-[10px] font-semibold text-violet-700">
                Offer Out
              </span>
            </button>
          ))}
          {remaining > 0 && (
            <Link href="/candidates" className="flex items-center justify-center gap-1 rounded-lg border border-dashed border-slate-200 py-2 text-xs text-slate-400 hover:border-blue-300 hover:text-blue-600 transition-colors">
              +{remaining} more offer{remaining !== 1 ? 's' : ''} →
            </Link>
          )}
        </div>
      )}
    </div>
  )
}

// ── RecentActivityWidget ──────────────────────────────────────────────────────

const EVENT_TYPE_LABELS: Record<string, string> = {
  applied: 'applied', stage_moved: 'moved to stage', note_added: 'note added',
  status_changed: 'status changed', email_sent: 'email sent',
}
const EVENT_TYPE_ICONS: Record<string, string> = {
  applied: '→', stage_moved: '↑', note_added: '✎', status_changed: '⟳', email_sent: '✉',
}
const EVENT_TYPE_COLORS: Record<string, string> = {
  applied: 'bg-blue-100 text-blue-600', stage_moved: 'bg-emerald-100 text-emerald-600',
  note_added: 'bg-slate-100 text-slate-500', status_changed: 'bg-amber-100 text-amber-600',
  email_sent: 'bg-violet-100 text-violet-600',
}

function RecentActivityWidget({ activity }: { activity: RecentEvent[] }) {
  const { showSearch, query, setQuery, toggle, filterFn } = useWidgetSearch()
  const filtered  = filterFn(activity, e => [e.candidate_name, e.job_title, e.to_stage ?? '', e.event_type])
  const preview   = filtered.slice(0, PREVIEW_LIMIT)
  const remaining = filtered.length - preview.length
  return (
    <div>
      <WidgetHeader wId="recent_activity" title="Recent Activity" href="/candidates"
        searchable showSearch={showSearch} onToggleSearch={toggle} query={query} onQueryChange={setQuery} />
      {activity.length === 0 ? (
        <p className="text-xs text-slate-400">No recent activity.</p>
      ) : (
        <div>
          {preview.map((e, idx) => (
            <div key={e.id} className="flex gap-2.5 py-2 border-b border-slate-50">
              <div className="flex flex-col items-center">
                <div className={`h-5 w-5 rounded-full flex items-center justify-center text-[10px] shrink-0 ${EVENT_TYPE_COLORS[e.event_type] ?? 'bg-slate-100 text-slate-500'}`}>
                  {EVENT_TYPE_ICONS[e.event_type] ?? '·'}
                </div>
                {idx < preview.length - 1 && (
                  <div className="w-px flex-1 bg-slate-100 mt-1" />
                )}
              </div>
              <div className="flex-1 min-w-0 pb-0.5">
                <div className="flex items-baseline gap-1.5 flex-wrap">
                  <span className="text-xs font-medium text-slate-800">{e.candidate_name}</span>
                  <span className="text-[10px] text-slate-400">{EVENT_TYPE_LABELS[e.event_type] ?? e.event_type}</span>
                  {e.to_stage && (
                    <span className="text-[10px] font-medium text-blue-600">→ {e.to_stage}</span>
                  )}
                </div>
                <p className="text-[10px] text-slate-400 truncate">{e.job_title}</p>
                <p className="text-[10px] text-slate-300">{timeAgo(e.created_at)}</p>
              </div>
            </div>
          ))}
          {remaining > 0 && (
            <Link href="/candidates" className="mt-1 flex items-center justify-center gap-1 rounded-lg border border-dashed border-slate-200 py-2 text-xs text-slate-400 hover:border-blue-300 hover:text-blue-600 transition-colors">
              +{remaining} more event{remaining !== 1 ? 's' : ''} →
            </Link>
          )}
        </div>
      )}
    </div>
  )
}

// ── ActionQueueWidget ─────────────────────────────────────────────────────────

interface ActionItem {
  id: string
  type: 'approve' | 'score' | 'followup' | 'feedback'
  title: string
  sub: string
  openSince: string | null
  actionLabel: string
  actionColor: string
  iconColor: string
  icon: React.ReactNode
  /** For approve: hiring_request_id. For score: job_id. For followup/feedback: application_id */
  targetId: string
  candidateId?: string
}

function ActionQueueWidget({
  data, onCandidateClick, onRefresh,
}: {
  data: DashboardData; onCandidateClick: (id: string) => void; onRefresh?: () => void
}) {
  const [actioningId, setActioningId] = useState<string | null>(null)
  const [doneIds, setDoneIds]         = useState<Set<string>>(new Set())

  // Build action items from dashboard data
  const items: ActionItem[] = []

  // 1. JDs awaiting approval
  for (const t of data.tasks.pending_approvals) {
    items.push({
      id: `approve-${t.id}`, type: 'approve', targetId: t.id,
      title: t.title,
      sub: `${t.department ?? 'No dept'}${t.location ? ` · ${t.location}` : ''}`,
      openSince: t.created_at,
      actionLabel: 'Approve & Post', actionColor: 'bg-emerald-500 hover:bg-emerald-600',
      iconColor: 'bg-emerald-100 text-emerald-600',
      icon: <CheckSquare className="h-3 w-3" />,
    })
  }

  // 2. Applications needing scoring (from application_review — jobs with unreviewed first-stage candidates)
  for (const r of data.application_review) {
    items.push({
      id: `score-${r.job_id}`, type: 'score', targetId: r.job_id,
      title: `${r.count} candidate${r.count !== 1 ? 's' : ''} need scoring`,
      sub: r.job_title,
      openSince: null,
      actionLabel: 'Score Now', actionColor: 'bg-amber-500 hover:bg-amber-600',
      iconColor: 'bg-amber-100 text-amber-600',
      icon: <Star className="h-3 w-3" />,
    })
  }

  // 3. Overdue follow-ups
  for (const t of data.tasks.overdue_followups) {
    items.push({
      id: `followup-${t.id}`, type: 'followup', targetId: t.id,
      title: t.candidate_name, sub: `Follow-up overdue · ${t.job_title}`,
      openSince: t.last_event_at,
      candidateId: t.candidate_id,
      actionLabel: 'Mark Done', actionColor: 'bg-slate-500 hover:bg-slate-600',
      iconColor: 'bg-red-100 text-red-500',
      icon: <Bell className="h-3 w-3" />,
    })
  }

  // 4. Feedback needed
  for (const t of data.tasks.feedback_needed) {
    items.push({
      id: `feedback-${t.id}`, type: 'feedback', targetId: t.id,
      title: t.candidate_name, sub: `Feedback needed · ${t.job_title}`,
      openSince: t.moved_at,
      candidateId: t.candidate_id,
      actionLabel: 'Review', actionColor: 'bg-blue-500 hover:bg-blue-600',
      iconColor: 'bg-amber-100 text-amber-600',
      icon: <MessageSquare className="h-3 w-3" />,
    })
  }

  const visibleItems = items.filter(i => !doneIds.has(i.id))

  async function handleAction(item: ActionItem) {
    setActioningId(item.id)
    try {
      if (item.type === 'approve') {
        await fetch(`/api/hiring-requests/${item.targetId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'posted' }),
        })
      } else if (item.type === 'score') {
        await fetch(`/api/jobs/${item.targetId}/score`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        })
      } else if (item.type === 'followup') {
        await fetch(`/api/applications/${item.targetId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ note: 'Follow-up completed', created_by: 'Recruiter' }),
        })
      } else if (item.type === 'feedback') {
        // Open candidate drawer for feedback
        if (item.candidateId) onCandidateClick(item.candidateId)
        setActioningId(null)
        return
      }
      setDoneIds(prev => new Set(prev).add(item.id))
      setTimeout(() => onRefresh?.(), 1500)
    } finally {
      setActioningId(null)
    }
  }

  return (
    <div>
      <WidgetHeader wId="action_queue" title="Action Queue" badge={visibleItems.length} />

      {visibleItems.length === 0 ? (
        <div className="py-8 text-center">
          <CheckSquare className="mx-auto mb-2 h-6 w-6 text-emerald-300" />
          <p className="text-xs font-medium text-slate-600">All caught up!</p>
          <p className="mt-0.5 text-[10px] text-slate-400">No pending actions right now</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {visibleItems.slice(0, 8).map(item => (
            <div key={item.id}
              className="flex items-center gap-2.5 rounded-lg border border-slate-100 bg-white px-3 py-2.5 hover:border-slate-200 transition-colors"
            >
              <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg ${item.iconColor}`}>
                {item.icon}
              </div>
              <div className="flex-1 min-w-0 cursor-pointer" onClick={() => item.candidateId && onCandidateClick(item.candidateId)}>
                <p className="text-xs font-medium text-slate-800 truncate">{item.title}</p>
                <p className="text-[10px] text-slate-400 truncate">{item.sub}</p>
              </div>
              {item.openSince && (
                <span className="shrink-0 text-[10px] text-slate-400" title={new Date(item.openSince).toLocaleString()}>
                  {timeAgo(item.openSince)}
                </span>
              )}
              {doneIds.has(item.id) ? (
                <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
                  Done!
                </span>
              ) : (
                <button
                  onClick={() => handleAction(item)}
                  disabled={actioningId === item.id}
                  className={`shrink-0 rounded-lg px-2.5 py-1 text-[10px] font-medium text-white transition-colors disabled:opacity-50 ${item.actionColor}`}
                >
                  {actioningId === item.id ? '...' : item.actionLabel}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── StageFunnelWidget ─────────────────────────────────────────────────────────

function StageFunnelWidget({ funnel }: { funnel: StageFunnelItem[] }) {
  const { showSearch, query, setQuery, toggle, filterFn } = useWidgetSearch()
  const filtered  = filterFn(funnel, s => [s.stage_name])
  const preview   = filtered.slice(0, PREVIEW_LIMIT)
  const remaining = filtered.length - preview.length
  const max = Math.max(...funnel.map(s => s.count), 1)
  const total = funnel.reduce((sum, s) => sum + s.count, 0)
  return (
    <div>
      <WidgetHeader wId="stage_funnel" title="Stage Funnel" href="/pipeline"
        searchable showSearch={showSearch} onToggleSearch={toggle} query={query} onQueryChange={setQuery} />
      {funnel.length === 0 ? (
        <p className="text-xs text-slate-400">No active candidates in the pipeline.</p>
      ) : (
        <div className="space-y-2">
          {preview.map(s => {
            const pct = total > 0 ? Math.round((s.count / total) * 100) : 0
            return (
              <Link key={s.stage_id} href={`/pipeline?stage=${s.stage_id}`}
                className="flex items-center gap-2.5 rounded-lg px-1 py-0.5 hover:bg-slate-50 transition-colors group"
              >
                <div className={`h-2 w-2 shrink-0 rounded-full ${STAGE_COLORS[s.color] ?? 'bg-slate-400'}`} />
                <span className="w-24 shrink-0 truncate text-xs text-slate-600 group-hover:text-slate-900">{s.stage_name}</span>
                <div className="flex-1 h-3 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className={`h-full rounded-full ${STAGE_COLORS[s.color] ?? 'bg-slate-400'} transition-all`}
                    style={{ width: `${(s.count / max) * 100}%` }}
                  />
                </div>
                <span className="w-5 shrink-0 text-right text-xs font-semibold text-slate-700">{s.count}</span>
                <span className="w-8 shrink-0 text-right text-[10px] text-slate-400">{pct}%</span>
              </Link>
            )
          })}
          {remaining > 0 && (
            <Link href="/pipeline" className="flex items-center justify-center gap-1 rounded-lg border border-dashed border-slate-200 py-2 text-xs text-slate-400 hover:border-blue-300 hover:text-blue-600 transition-colors">
              +{remaining} more stage{remaining !== 1 ? 's' : ''} →
            </Link>
          )}
        </div>
      )}
    </div>
  )
}

// ── RightPanelCustomizer — same widget catalog + categories as main area ────────

function RightPanelCustomizer({
  activeWidgets,
  snapshotWidgets,
  onClose,
  onDiscard,
  onReorder,
  onRemove,
  onAdd,
}: {
  activeWidgets:   WidgetId[]
  snapshotWidgets: WidgetId[]
  onClose:   () => void
  onDiscard: () => void
  onReorder: (widgets: WidgetId[]) => void
  onRemove:  (id: WidgetId) => void
  onAdd:     (id: WidgetId) => void
}) {
  const [draggingId,     setDraggingId]     = useState<WidgetId | null>(null)
  const [dragOverId,     setDragOverId]     = useState<WidgetId | null>(null)
  const [showExitDialog, setShowExitDialog] = useState(false)

  const hasChanges     = JSON.stringify(activeWidgets) !== JSON.stringify(snapshotWidgets)
  const availableToAdd = ALL_WIDGET_DEFS.filter(w => !activeWidgets.includes(w.id))

  function handleDoneClick() {
    if (hasChanges) setShowExitDialog(true)
    else onClose()
  }

  function handleDragStart(id: WidgetId) { setDraggingId(id) }

  function handleDragOver(e: React.DragEvent, id: WidgetId) {
    e.preventDefault()
    setDragOverId(id)
  }

  function handleDrop(targetId: WidgetId) {
    if (!draggingId || draggingId === targetId) { setDraggingId(null); setDragOverId(null); return }
    const fromIdx = activeWidgets.indexOf(draggingId)
    const toIdx   = activeWidgets.indexOf(targetId)
    const next    = [...activeWidgets]
    next.splice(fromIdx, 1)
    next.splice(toIdx, 0, draggingId)
    onReorder(next)
    setDraggingId(null)
    setDragOverId(null)
  }

  function handleDragEnd() { setDraggingId(null); setDragOverId(null) }

  return (
    <div className="border-b border-slate-100 bg-blue-50/40 px-4 py-4">
      {/* Header */}
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs font-semibold text-slate-800">Customize panel</p>
        <div className="flex items-center gap-1.5">
          {hasChanges && (
            <button
              onClick={() => setShowExitDialog(true)}
              className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-500 hover:text-red-500 transition-colors"
            >
              Discard
            </button>
          )}
          <button
            onClick={handleDoneClick}
            className="rounded-lg bg-blue-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-blue-700 transition-colors"
          >
            Done
          </button>
        </div>
      </div>

      <p className="mb-3 text-[10px] text-slate-400">Drag to reorder · click × to remove</p>

      {/* Save/Discard dialog */}
      {showExitDialog && (
        <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
          <p className="text-xs font-semibold text-slate-800">Save changes?</p>
          <div className="mt-2 flex gap-1.5">
            <button onClick={() => setShowExitDialog(false)}
              className="flex-1 rounded-lg border border-slate-200 bg-white py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50 transition-colors"
            >Keep editing</button>
            <button onClick={onDiscard}
              className="flex-1 rounded-lg border border-red-200 bg-white py-1 text-[11px] font-medium text-red-600 hover:bg-red-50 transition-colors"
            >Discard</button>
            <button onClick={onClose}
              className="flex-1 rounded-lg bg-blue-600 py-1 text-[11px] font-medium text-white hover:bg-blue-700 transition-colors"
            >Save</button>
          </div>
        </div>
      )}

      {/* Active widgets — drag to reorder */}
      <div className="mb-4 space-y-1">
        <p className="mb-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-400">Active widgets</p>
        {activeWidgets.map(wId => {
          const def        = ALL_WIDGET_DEFS.find(w => w.id === wId)
          if (!def) return null
          const Icon       = def.icon
          const isDragging = draggingId === wId
          const isDragOver = dragOverId === wId && draggingId !== wId
          return (
            <div
              key={wId}
              draggable
              onDragStart={() => handleDragStart(wId)}
              onDragOver={e => handleDragOver(e, wId)}
              onDrop={() => handleDrop(wId)}
              onDragEnd={handleDragEnd}
              className={`flex items-center gap-2 rounded-lg border bg-white px-2.5 py-2 cursor-grab active:cursor-grabbing transition-all ${
                isDragging ? 'opacity-40 scale-95 border-blue-300' :
                isDragOver ? 'border-blue-400 shadow-sm ring-1 ring-blue-300 -translate-y-0.5' :
                'border-slate-200 hover:border-slate-300'
              }`}
            >
              <GripVertical className="h-3.5 w-3.5 shrink-0 text-slate-300" />
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-slate-100">
                <Icon className="h-3 w-3 text-slate-600" />
              </div>
              <span className="flex-1 min-w-0 text-xs font-medium text-slate-700 truncate">{def.name}</span>
              <button
                onClick={() => onRemove(wId)}
                className="shrink-0 rounded p-0.5 text-slate-400 hover:bg-red-50 hover:text-red-500 transition-colors"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          )
        })}
        {activeWidgets.length === 0 && (
          <p className="py-3 text-center text-xs text-slate-400">No widgets active. Add one below.</p>
        )}
      </div>

      {/* Available to add — grouped by category */}
      {availableToAdd.length > 0 && (
        <div>
          <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">Add widgets</p>
          {(['jobs', 'candidates', 'activity'] as WidgetCategory[]).map(cat => {
            const defsInCat = availableToAdd.filter(d => d.category === cat)
            if (defsInCat.length === 0) return null
            return (
              <div key={cat} className="mb-3">
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  {CATEGORY_LABELS[cat]}
                </p>
                <div className="space-y-1">
                  {defsInCat.map(def => {
                    const Icon = def.icon
                    return (
                      <button
                        key={def.id}
                        onClick={() => onAdd(def.id)}
                        className="flex w-full items-center gap-2 rounded-lg border border-dashed border-slate-300 bg-white px-2.5 py-2 text-left hover:border-blue-400 hover:bg-blue-50 transition-colors"
                      >
                        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-slate-100">
                          <Icon className="h-3 w-3 text-slate-500" />
                        </div>
                        <span className="flex-1 min-w-0 text-xs font-medium text-slate-700 truncate">{def.name}</span>
                        <Plus className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── ActivityPanel (right column — full widget catalog) ─────────────────────────

function ActivityPanel({
  data,
  rightWidgets, rightPanelMode, rightWidgetSnapshot,
  onOpenCustomizer, onCloseCustomizer, onDiscardCustomizer,
  onReorderWidgets, onRemoveWidget, onAddWidget,
  onCandidateClick,
  onRefresh,
}: {
  data: DashboardData
  rightWidgets:        WidgetId[]
  rightPanelMode:      boolean
  rightWidgetSnapshot: WidgetId[]
  onOpenCustomizer:    () => void
  onCloseCustomizer:   () => void
  onDiscardCustomizer: () => void
  onReorderWidgets:    (widgets: WidgetId[]) => void
  onRemoveWidget:      (id: WidgetId) => void
  onAddWidget:         (id: WidgetId) => void
  onCandidateClick:    (id: string) => void
  onRefresh?:          () => void
}) {
  return (
    <aside className="sticky top-0 h-screen w-72 shrink-0 overflow-y-auto border-l border-slate-200 bg-white">

      {/* Panel header */}
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5">
        <span className="text-xs font-semibold text-slate-600">Panel</span>
        <button
          onClick={rightPanelMode ? undefined : onOpenCustomizer}
          title="Customise panel"
          className={`flex items-center justify-center rounded-lg border p-1.5 transition-colors ${
            rightPanelMode
              ? 'border-blue-300 bg-blue-50 text-blue-600 cursor-default'
              : 'border-slate-200 text-slate-400 hover:bg-slate-50 hover:text-slate-700'
          }`}
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* In-place customizer */}
      {rightPanelMode && (
        <RightPanelCustomizer
          activeWidgets={rightWidgets}
          snapshotWidgets={rightWidgetSnapshot}
          onClose={onCloseCustomizer}
          onDiscard={onDiscardCustomizer}
          onReorder={onReorderWidgets}
          onRemove={onRemoveWidget}
          onAdd={onAddWidget}
        />
      )}

      {/* Widgets rendered in user-defined order — same components as main area */}
      {rightWidgets.map((wId, idx) => (
        <div
          key={wId}
          className={`px-4 py-4 ${idx < rightWidgets.length - 1 ? 'border-b border-slate-100' : ''} ${rightPanelMode ? 'pointer-events-none opacity-40' : ''}`}
        >
          {wId === 'interviews'          && <InterviewsWidget         interviews={data.upcoming_interviews} onCandidateClick={onCandidateClick} />}
          {wId === 'tasks'               && <TasksWidget              tasks={data.tasks} onCandidateClick={onCandidateClick} onRefresh={onRefresh} />}
          {wId === 'overview_stats'      && <OverviewStatsWidget      stats={data.stats} />}
          {wId === 'pipeline'            && <PipelineWidget           breakdown={data.candidate_breakdown} />}
          {wId === 'jobs_mini'           && <JobsMiniWidget           jobs={data.top_jobs} />}
          {wId === 'jobs_by_dept'        && <JobsByDeptWidget         departments={data.jobs_by_dept} />}
          {wId === 'hm_actions'          && <HmActionsWidget          approvals={data.tasks.pending_approvals} />}
          {wId === 'recent_applications' && <RecentApplicationsWidget applications={data.recent_applications} onCandidateClick={onCandidateClick} />}
          {wId === 'top_scored'          && <TopScoredWidget          candidates={data.top_scored} onCandidateClick={onCandidateClick} />}
          {wId === 'candidate_sources'   && <CandidateSourcesWidget   sources={data.candidate_sources} />}
          {wId === 'offer_tracker'       && <OfferTrackerWidget        offers={data.offer_tracker} onCandidateClick={onCandidateClick} />}
          {wId === 'recent_activity'     && <RecentActivityWidget      activity={data.recent_activity} />}
          {wId === 'stage_funnel'        && <StageFunnelWidget         funnel={data.stage_funnel} />}
          {wId === 'action_queue'        && <ActionQueueWidget         data={data} onCandidateClick={onCandidateClick} onRefresh={onRefresh} />}
        </div>
      ))}

      {/* Empty state */}
      {rightWidgets.length === 0 && !rightPanelMode && (
        <div className="flex flex-col items-center justify-center px-4 py-16 text-center">
          <Settings2 className="mb-2 h-7 w-7 text-slate-200" />
          <p className="text-xs font-medium text-slate-500">Panel is empty</p>
          <p className="mt-1 text-[10px] text-slate-400">Click Customize to add widgets</p>
        </div>
      )}
    </aside>
  )
}

// ── WidgetCustomizer (shown in-place when customizing) ────────────────────────

function WidgetCustomizer({
  activeWidgets,
  snapshotWidgets,
  onClose,
  onDiscard,
  onReorder,
  onRemove,
  onAdd,
}: {
  activeWidgets:   WidgetId[]
  snapshotWidgets: WidgetId[]
  onClose:   () => void
  onDiscard: () => void
  onReorder: (widgets: WidgetId[]) => void
  onRemove:  (id: WidgetId) => void
  onAdd:     (id: WidgetId) => void
}) {
  const [draggingId,    setDraggingId]    = useState<WidgetId | null>(null)
  const [dragOverId,    setDragOverId]    = useState<WidgetId | null>(null)
  const [showExitDialog, setShowExitDialog] = useState(false)

  const hasChanges = JSON.stringify(activeWidgets) !== JSON.stringify(snapshotWidgets)
  const availableToAdd = ALL_WIDGET_DEFS.filter(w => !activeWidgets.includes(w.id))

  function handleDoneClick() {
    if (hasChanges) {
      setShowExitDialog(true)
    } else {
      onClose()
    }
  }

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
        <div className="flex items-center gap-2">
          {hasChanges && (
            <button
              onClick={() => setShowExitDialog(true)}
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-50 hover:text-red-500 transition-colors"
            >
              Discard
            </button>
          )}
          <button
            onClick={handleDoneClick}
            className="flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 transition-colors"
          >
            Done
          </button>
        </div>
      </div>

      {/* Save / Discard confirmation dialog */}
      {showExitDialog && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-slate-800">Save changes to this view?</p>
              <p className="mt-0.5 text-xs text-slate-500">
                You&apos;ve changed the widget layout. Do you want to keep or discard these changes?
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button
                onClick={() => setShowExitDialog(false)}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors"
              >
                Keep editing
              </button>
              <button
                onClick={onDiscard}
                className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 transition-colors"
              >
                Discard changes
              </button>
              <button
                onClick={onClose}
                className="rounded-lg border border-blue-200 bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 transition-colors"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

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

      {/* Available widgets to add — grouped by category */}
      {availableToAdd.length > 0 && (
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-3">Add widgets</p>
          {(['jobs', 'candidates', 'activity'] as WidgetCategory[]).map(cat => {
            const defsInCat = availableToAdd.filter(d => d.category === cat)
            if (defsInCat.length === 0) return null
            return (
              <div key={cat} className="mb-4">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                  {CATEGORY_LABELS[cat]}
                </p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {defsInCat.map(def => {
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
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-medium text-slate-700">{def.name}</p>
                        </div>
                        <Plus className="ml-auto h-3.5 w-3.5 shrink-0 text-slate-400" />
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}
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

  // Quick-view drawer
  const [drawerCandidateId, setDrawerCandidateId] = useState<string | null>(null)

  // Views
  const [views,          setViews]         = useState<DashView[]>(DEFAULT_VIEWS)
  const [activeViewId,   setActiveViewId]  = useState('home')
  const [viewEditMode,   setViewEditMode]  = useState(false)
  const [widgetMode,     setWidgetMode]    = useState(false)
  const [widgetSnapshot, setWidgetSnapshot] = useState<WidgetId[]>([])
  const [hydrated,       setHydrated]      = useState(false)

  // Right panel state
  const [rightWidgets,        setRightWidgets]        = useState<WidgetId[]>(DEFAULT_RIGHT_WIDGETS)
  const [rightPanelMode,      setRightPanelMode]      = useState(false)
  const [rightWidgetSnapshot, setRightWidgetSnapshot] = useState<WidgetId[]>([])


  // Hydrate localStorage — migrate old data that lacks `widgets`
  useEffect(() => {
    try {
      const version = localStorage.getItem(LS_VERSION)

      if (version !== CURRENT_VERSION) {
        // First load after upgrade — clear stale data, start fresh with defaults
        localStorage.removeItem(LS_VIEWS)
        localStorage.removeItem(LS_ACTIVE)
        localStorage.setItem(LS_VERSION, CURRENT_VERSION)
      } else {
        const v = localStorage.getItem(LS_VIEWS)
        if (v) {
          const parsed = JSON.parse(v) as DashView[]
          // Migrate any view missing the widgets array
          const migrated = parsed.map(view => {
            if (!Array.isArray(view.widgets)) {
              const def = DEFAULT_VIEWS.find(d => d.id === view.id)
              return { ...view, widgets: def?.widgets ?? (['interviews', 'tasks'] as WidgetId[]) }
            }
            return view
          })
          setViews(migrated)
        }
        const a = localStorage.getItem(LS_ACTIVE)
        if (a) setActiveViewId(a)
      }
    } catch {
      // Corrupted storage — reset silently
      localStorage.removeItem(LS_VIEWS)
      localStorage.removeItem(LS_ACTIVE)
    }
    // Hydrate right panel widgets — filter out stale IDs from old schema
    try {
      const rw = localStorage.getItem(LS_RIGHT_WIDGETS)
      if (rw) {
        const parsed = JSON.parse(rw) as string[]
        const validIds = new Set(ALL_WIDGET_DEFS.map(w => w.id))
        const valid = parsed.filter(id => validIds.has(id as WidgetId)) as WidgetId[]
        if (valid.length > 0) setRightWidgets(valid)
        // If all IDs were stale (old schema), keep DEFAULT_RIGHT_WIDGETS
      }
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

  useEffect(() => {
    if (!hydrated) return
    try { localStorage.setItem(LS_RIGHT_WIDGETS, JSON.stringify(rightWidgets)) } catch {}
  }, [rightWidgets, hydrated])

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
    updateWidgets((view.widgets ?? []).filter(w => w !== id))
  }
  function handleAddWidget(id: WidgetId) {
    const view = views.find(v => v.id === activeViewId)
    if (!view) return
    updateWidgets([...(view.widgets ?? []), id])
  }
  function handleDiscardWidgets() {
    updateWidgets(widgetSnapshot)
    setWidgetMode(false)
  }
  function handleOpenCustomizer() {
    const view = views.find(v => v.id === activeViewId)
    setWidgetSnapshot(view?.widgets ?? [])
    setWidgetMode(true)
  }

  // Right panel handlers
  function handleRightOpenCustomizer() {
    setRightWidgetSnapshot(rightWidgets)
    setRightPanelMode(true)
  }
  function handleRightCloseCustomizer()   { setRightPanelMode(false) }
  function handleRightDiscardCustomizer() { setRightWidgets(rightWidgetSnapshot); setRightPanelMode(false) }
  function handleRightReorderWidgets(widgets: WidgetId[]) { setRightWidgets(widgets) }
  function handleRightRemoveWidget(id: WidgetId)         { setRightWidgets(prev => prev.filter(w => w !== id)) }

  // Widget size helpers
  function getWidgetSize(wId: WidgetId): WidgetSize {
    const view = views.find(v => v.id === activeViewId)
    return view?.widgetSizes?.[wId] ?? 'small'
  }
  function cycleWidgetSize(wId: WidgetId) {
    const current = getWidgetSize(wId)
    const next: WidgetSize = current === 'small' ? 'wide' : current === 'wide' ? 'tall' : current === 'tall' ? 'large' : 'small'
    setViews(prev => prev.map(v => {
      if (v.id !== activeViewId) return v
      return { ...v, widgetSizes: { ...(v.widgetSizes ?? {}), [wId]: next } }
    }))
  }
  function handleRightAddWidget(id: WidgetId)            { setRightWidgets(prev => [...prev, id]) }

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
    <div className="flex bg-slate-50">

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
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-200">
          {/* View name */}
          <div className="flex items-center gap-1.5">
            <ActiveIcon className="h-3.5 w-3.5 text-slate-400" />
            <span className="text-xs font-semibold text-slate-700">{activeView?.name}</span>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1">
            <button
              onClick={widgetMode ? undefined : handleOpenCustomizer}
              title="Customise view"
              className={`flex items-center justify-center rounded-lg border p-1.5 transition-colors ${
                widgetMode
                  ? 'border-blue-300 bg-blue-50 text-blue-600 cursor-default'
                  : 'border-slate-200 text-slate-400 hover:bg-slate-50 hover:text-slate-700'
              }`}
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => fetchData(true)}
              disabled={refreshing}
              title="Refresh"
              className="flex items-center justify-center rounded-lg border border-slate-200 p-1.5 text-slate-400 hover:bg-slate-50 hover:text-slate-700 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Widget area */}
        <div className="p-4">
          {/* Customize panel */}
          {widgetMode && (
            <div className="mb-4">
              <WidgetCustomizer
                activeWidgets={activeView?.widgets ?? []}
                snapshotWidgets={widgetSnapshot}
                onClose={() => setWidgetMode(false)}
                onDiscard={handleDiscardWidgets}
                onReorder={updateWidgets}
                onRemove={handleRemoveWidget}
                onAdd={handleAddWidget}
              />
            </div>
          )}

          {/* Render widgets in 2-col grid */}
          {(activeView?.widgets ?? []).length > 0 ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {(activeView?.widgets ?? []).map(wId => {
                const size = getWidgetSize(wId)
                const sizeClass =
                  size === 'wide'  ? 'lg:col-span-2' :
                  size === 'tall'  ? 'lg:row-span-2' :
                  size === 'large' ? 'lg:col-span-2 lg:row-span-2' : ''
                const SIZE_LABELS: Record<WidgetSize, string> = { small: '1×1', wide: '2×1', tall: '1×2', large: '2×2' }
                return (
                  <div
                    key={wId}
                    className={`group relative rounded-xl border border-slate-200 border-t-2 ${widgetAccent(wId).border} bg-white p-4 ${sizeClass} ${widgetMode ? 'opacity-50 pointer-events-none' : ''}`}
                  >
                    {/* Resize toggle — visible on hover */}
                    {!widgetMode && (
                      <button
                        onClick={() => cycleWidgetSize(wId)}
                        title={`Size: ${SIZE_LABELS[size]} — click to cycle`}
                        className="absolute top-2 right-2 z-10 rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[9px] font-medium text-slate-400 opacity-0 group-hover:opacity-100 hover:bg-slate-50 hover:text-slate-600 transition-all"
                      >
                        {SIZE_LABELS[size]}
                      </button>
                    )}
                    {wId === 'interviews'         && <InterviewsWidget         interviews={data.upcoming_interviews} onCandidateClick={setDrawerCandidateId} />}
                    {wId === 'tasks'              && <TasksWidget              tasks={data.tasks} onCandidateClick={setDrawerCandidateId} onRefresh={() => fetchData(true)} />}
                    {wId === 'overview_stats'     && <OverviewStatsWidget      stats={data.stats} />}
                    {wId === 'pipeline'           && <PipelineWidget           breakdown={data.candidate_breakdown} />}
                    {wId === 'jobs_mini'          && <JobsMiniWidget           jobs={data.top_jobs} />}
                    {wId === 'jobs_by_dept'       && <JobsByDeptWidget         departments={data.jobs_by_dept} />}
                    {wId === 'hm_actions'         && <HmActionsWidget          approvals={data.tasks.pending_approvals} />}
                    {wId === 'recent_applications'&& <RecentApplicationsWidget applications={data.recent_applications} onCandidateClick={setDrawerCandidateId} />}
                    {wId === 'top_scored'         && <TopScoredWidget          candidates={data.top_scored} onCandidateClick={setDrawerCandidateId} />}
                    {wId === 'candidate_sources'  && <CandidateSourcesWidget   sources={data.candidate_sources} />}
                    {wId === 'offer_tracker'      && <OfferTrackerWidget        offers={data.offer_tracker} onCandidateClick={setDrawerCandidateId} />}
                    {wId === 'recent_activity'    && <RecentActivityWidget      activity={data.recent_activity} />}
                    {wId === 'stage_funnel'       && <StageFunnelWidget         funnel={data.stage_funnel} />}
                    {wId === 'action_queue'      && <ActionQueueWidget         data={data} onCandidateClick={setDrawerCandidateId} onRefresh={() => fetchData(true)} />}
                  </div>
                )
              })}
            </div>
          ) : !widgetMode ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <Settings2 className="mb-3 h-8 w-8 text-slate-300" />
              <p className="text-sm font-medium text-slate-600">This view has no widgets yet</p>
              <p className="mt-1 text-xs text-slate-400">Click <strong>Customize</strong> above to add some</p>
            </div>
          ) : null}
        </div>
      </div>

      {/* Right panel — full widget catalog */}
      <ActivityPanel
        data={data}
        rightWidgets={rightWidgets}
        rightPanelMode={rightPanelMode}
        rightWidgetSnapshot={rightWidgetSnapshot}
        onOpenCustomizer={handleRightOpenCustomizer}
        onCloseCustomizer={handleRightCloseCustomizer}
        onDiscardCustomizer={handleRightDiscardCustomizer}
        onReorderWidgets={handleRightReorderWidgets}
        onRemoveWidget={handleRightRemoveWidget}
        onAddWidget={handleRightAddWidget}
        onCandidateClick={setDrawerCandidateId}
        onRefresh={() => fetchData(true)}
      />

      {/* Candidate quick-view drawer */}
      <CandidateDrawer
        candidateId={drawerCandidateId}
        onClose={() => setDrawerCandidateId(null)}
        onActionComplete={() => fetchData(true)}
      />
    </div>
  )
}
