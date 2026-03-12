'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
  ArrowLeft, Plus, Link2, Users, Pencil, Check, X,
  UserPlus, Search, ChevronDown, MoreHorizontal,
  Loader2, AlertCircle, ExternalLink, ClipboardList, Star, Trash2,
  Settings2, LayoutList, Kanban, Filter, ArrowDownUp,
} from 'lucide-react'
import type {
  JobWithPipeline, PipelineStage, Application, Candidate, StageColor,
  Scorecard, ScorecardRecommendation, ScorecardScore, AiRecommendation,
} from '@/lib/types/database'

// ── Scorecard config (shared) ─────────────────────────────────────────────────

const DEFAULT_CRITERIA = ['Technical Skills', 'Communication', 'Problem Solving', 'Culture Fit']

const RECOMMENDATION_CONFIG: Record<ScorecardRecommendation, { label: string; badge: string; active: string; btn: string }> = {
  strong_yes: { label: 'Strong Yes', badge: 'bg-emerald-100 text-emerald-700', active: 'bg-emerald-600 text-white border-emerald-600', btn: 'border border-emerald-200 text-emerald-700 hover:bg-emerald-50' },
  yes:        { label: 'Yes',        badge: 'bg-blue-100 text-blue-700',       active: 'bg-blue-600 text-white border-blue-600',       btn: 'border border-blue-200 text-blue-700 hover:bg-blue-50'       },
  maybe:      { label: 'Maybe',      badge: 'bg-amber-100 text-amber-700',     active: 'bg-amber-500 text-white border-amber-500',     btn: 'border border-amber-200 text-amber-700 hover:bg-amber-50'   },
  no:         { label: 'No',         badge: 'bg-red-100 text-red-700',         active: 'bg-red-600 text-white border-red-600',         btn: 'border border-red-200 text-red-700 hover:bg-red-50'         },
}

const RATING_CONFIG = [
  { value: 1 as const, label: 'Poor',      dot: 'bg-red-400',     active: 'bg-red-500 text-white border-red-500',         btn: 'border border-red-200 text-red-600 hover:bg-red-50'         },
  { value: 2 as const, label: 'Fair',      dot: 'bg-amber-400',   active: 'bg-amber-500 text-white border-amber-500',     btn: 'border border-amber-200 text-amber-600 hover:bg-amber-50'   },
  { value: 3 as const, label: 'Good',      dot: 'bg-blue-400',    active: 'bg-blue-500 text-white border-blue-500',       btn: 'border border-blue-200 text-blue-600 hover:bg-blue-50'       },
  { value: 4 as const, label: 'Excellent', dot: 'bg-emerald-400', active: 'bg-emerald-500 text-white border-emerald-500', btn: 'border border-emerald-200 text-emerald-600 hover:bg-emerald-50' },
]

function RatingDots({ rating }: { rating: number }) {
  const cfg = RATING_CONFIG[rating - 1]
  return (
    <div className="flex gap-0.5 items-center">
      {[1, 2, 3, 4].map(i => (
        <div key={i} className={`h-2 w-2 rounded-full ${i <= rating ? (cfg?.dot ?? 'bg-slate-400') : 'bg-slate-200'}`} />
      ))}
    </div>
  )
}

function fmtRelative(d: string) {
  const diff = Date.now() - new Date(d).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

// ── Stage colours ─────────────────────────────────────────────────────────────

const STAGE_STYLES: Record<StageColor, { header: string; dot: string; border: string }> = {
  slate:   { header: 'bg-slate-100',   dot: 'bg-slate-400',   border: 'border-slate-300' },
  blue:    { header: 'bg-blue-50',     dot: 'bg-blue-500',    border: 'border-blue-300'  },
  violet:  { header: 'bg-violet-50',   dot: 'bg-violet-500',  border: 'border-violet-300'},
  amber:   { header: 'bg-amber-50',    dot: 'bg-amber-500',   border: 'border-amber-300' },
  emerald: { header: 'bg-emerald-50',  dot: 'bg-emerald-500', border: 'border-emerald-300'},
  green:   { header: 'bg-green-50',    dot: 'bg-green-500',   border: 'border-green-300' },
  red:     { header: 'bg-red-50',      dot: 'bg-red-500',     border: 'border-red-300'   },
  pink:    { header: 'bg-pink-50',     dot: 'bg-pink-500',    border: 'border-pink-300'  },
}

const COLOR_OPTIONS: { value: StageColor; label: string; dot: string }[] = [
  { value: 'slate',   label: 'Grey',    dot: 'bg-slate-400'   },
  { value: 'blue',    label: 'Blue',    dot: 'bg-blue-500'    },
  { value: 'violet',  label: 'Purple',  dot: 'bg-violet-500'  },
  { value: 'amber',   label: 'Amber',   dot: 'bg-amber-500'   },
  { value: 'emerald', label: 'Teal',    dot: 'bg-emerald-500' },
  { value: 'green',   label: 'Green',   dot: 'bg-green-500'   },
  { value: 'red',     label: 'Red',     dot: 'bg-red-500'     },
  { value: 'pink',    label: 'Pink',    dot: 'bg-pink-500'    },
]

const SOURCE_LABELS: Record<string, string> = {
  manual: 'Added', applied: 'Applied', imported: 'Imported',
  sourced: 'Sourced', referral: 'Referral',
}

const SOURCE_COLORS: Record<string, string> = {
  manual: 'bg-slate-100 text-slate-600',
  applied: 'bg-blue-50 text-blue-700',
  imported: 'bg-violet-50 text-violet-700',
  sourced: 'bg-amber-50 text-amber-700',
  referral: 'bg-emerald-50 text-emerald-700',
}

// ── Avatar ────────────────────────────────────────────────────────────────────

const AVATAR_COLORS = [
  'bg-blue-100 text-blue-700', 'bg-violet-100 text-violet-700',
  'bg-amber-100 text-amber-700', 'bg-emerald-100 text-emerald-700',
  'bg-pink-100 text-pink-700', 'bg-indigo-100 text-indigo-700',
]

function avatarColor(name: string) {
  const h = name.split('').reduce((a, c) => a + c.charCodeAt(0), 0)
  return AVATAR_COLORS[h % AVATAR_COLORS.length]
}

function initials(name: string) {
  return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
}

function daysSince(dateStr: string) {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000)
}

// ── AI Score pill ─────────────────────────────────────────────────────────────

function ScorePill({ score }: { score: number | null }) {
  if (score === null) return null
  const color =
    score >= 75 ? 'bg-emerald-100 text-emerald-700' :
    score >= 60 ? 'bg-amber-100 text-amber-700'     :
                  'bg-red-100 text-red-700'
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-bold tabular-nums ${color}`}>
      {score}
    </span>
  )
}

const AI_REC_CONFIG: Record<AiRecommendation, { label: string; cls: string }> = {
  strong_yes: { label: 'Strong Yes', cls: 'bg-emerald-100 text-emerald-700' },
  yes:        { label: 'Yes',        cls: 'bg-blue-100 text-blue-700'       },
  maybe:      { label: 'Maybe',      cls: 'bg-amber-100 text-amber-700'     },
  no:         { label: 'No',         cls: 'bg-red-100 text-red-700'         },
}

// ── Candidate card ────────────────────────────────────────────────────────────

function CandidateCard({
  app, onDragStart, onClick, isSelected, onToggleSelect,
}: {
  app: Application
  onDragStart: (id: string) => void
  onClick: (app: Application) => void
  isSelected: boolean
  onToggleSelect: (id: string) => void
}) {
  const c = app.candidate!
  return (
    <div
      draggable
      onDragStart={() => onDragStart(app.id)}
      onClick={() => onClick(app)}
      className={`group cursor-pointer rounded-xl border bg-white px-4 py-3 shadow-sm hover:shadow-md transition-all select-none ${
        isSelected ? 'border-blue-400 ring-2 ring-blue-200' : 'border-slate-200 hover:border-blue-200'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          {/* Checkbox */}
          <div
            onClick={e => { e.stopPropagation(); onToggleSelect(app.id) }}
            className={`h-4 w-4 rounded border flex items-center justify-center shrink-0 cursor-pointer transition-colors ${
              isSelected ? 'bg-blue-500 border-blue-500' : 'border-slate-300 hover:border-blue-400 bg-white'
            }`}
          >
            {isSelected && <Check className="h-2.5 w-2.5 text-white" />}
          </div>
          <div className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 text-xs font-bold ${avatarColor(c.name)}`}>
            {initials(c.name)}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-900 truncate">{c.name}</p>
            {c.current_title && (
              <p className="text-xs text-slate-400 truncate">{c.current_title}</p>
            )}
          </div>
        </div>
        <MoreHorizontal className="h-4 w-4 text-slate-300 opacity-0 group-hover:opacity-100 shrink-0 mt-0.5 transition-opacity" />
      </div>
      <div className="flex items-center justify-between mt-2.5">
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${SOURCE_COLORS[app.source] ?? SOURCE_COLORS.manual}`}>
          {SOURCE_LABELS[app.source] ?? app.source}
        </span>
        <div className="flex items-center gap-1.5">
          {app.ai_score !== null && <ScorePill score={app.ai_score} />}
          <span className="text-xs text-slate-400">{daysSince(app.applied_at)}d</span>
        </div>
      </div>
    </div>
  )
}

// ── Stage column ──────────────────────────────────────────────────────────────

const STAGE_ACTIONS = [
  { id: 'score',              label: 'Score this stage',           icon: '⚡' },
  { id: 'divider1',           label: '',                           icon: '' },
  { id: 'schedule_interview', label: 'Schedule new interview',     icon: '📅' },
  { id: 'self_schedule',      label: 'Create self-schedule invite',icon: '🔗' },
  { id: 'send_message',       label: 'Send message to all',        icon: '✉️' },
  { id: 'send_assessment',    label: 'Send assessment',            icon: '📋' },
  { id: 'divider2',           label: '',                           icon: '' },
  { id: 'move_next',          label: 'Move all to next stage',     icon: '→' },
  { id: 'reject_all',         label: 'Reject all in stage',        icon: '✕' },
] as const

type StageActionId = typeof STAGE_ACTIONS[number]['id']

function StageColumn({
  stage,
  apps,
  editMode,
  isMenuOpen,
  onMenuOpen,
  onMenuClose,
  onScoreStage,
  onMoveAllNext,
  onDragStart,
  onDrop,
  onCardClick,
  onRename,
  onRecolor,
  onDelete,
  selectedApps,
  onToggleSelect,
  onScheduleInterview,
  selectedInStage,
}: {
  stage: PipelineStage
  apps: Application[]
  editMode: boolean
  isMenuOpen: boolean
  onMenuOpen: () => void
  onMenuClose: () => void
  onScoreStage: () => void
  onMoveAllNext: () => void
  onDragStart: (id: string) => void
  onDrop: (stageId: string) => void
  onCardClick: (app: Application) => void
  onRename: (id: string, name: string) => void
  onRecolor: (id: string, color: StageColor) => void
  onDelete: (id: string) => void
  selectedApps: Set<string>
  onToggleSelect: (id: string) => void
  onScheduleInterview: () => void
  selectedInStage: number
}) {
  const [over, setOver] = useState(false)
  const [editing, setEditing] = useState(false)
  const [nameVal, setNameVal] = useState(stage.name)
  const [showColors, setShowColors] = useState(false)
  const style = STAGE_STYLES[stage.color] ?? STAGE_STYLES.slate

  const saveRename = () => {
    if (nameVal.trim() && nameVal !== stage.name) onRename(stage.id, nameVal.trim())
    setEditing(false)
  }

  const handleAction = (actionId: StageActionId) => {
    onMenuClose()
    if (actionId === 'score') { onScoreStage(); return }
    if (actionId === 'move_next') { onMoveAllNext(); return }
    if (actionId === 'schedule_interview') { onScheduleInterview(); return }
    // Other actions: open first candidate's slide-over, show toast, etc.
    // Stubs for future implementation
  }

  return (
    <div
      className={`flex flex-col w-[260px] shrink-0 rounded-2xl border-2 transition-colors ${
        over ? `${style.border} shadow-md` : 'border-transparent'
      }`}
      onDragOver={e => { e.preventDefault(); setOver(true) }}
      onDragLeave={() => setOver(false)}
      onDrop={() => { setOver(false); onDrop(stage.id) }}
    >
      {/* Column header */}
      <div className={`flex items-center justify-between rounded-xl px-3 py-2.5 ${style.header}`}>
        <div className="flex items-center gap-2 min-w-0">
          <button
            onClick={() => editMode && setShowColors(!showColors)}
            className={`h-2.5 w-2.5 rounded-full shrink-0 ${style.dot} ${editMode ? 'cursor-pointer hover:ring-2 hover:ring-offset-1 hover:ring-slate-400' : ''}`}
          />
          {editing ? (
            <input
              autoFocus
              value={nameVal}
              onChange={e => setNameVal(e.target.value)}
              onBlur={saveRename}
              onKeyDown={e => { if (e.key === 'Enter') saveRename(); if (e.key === 'Escape') setEditing(false) }}
              className="text-sm font-semibold text-slate-700 bg-transparent border-b border-slate-400 outline-none w-full"
            />
          ) : (
            <span className="text-sm font-semibold text-slate-700 truncate">{stage.name}</span>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <span className="text-xs font-semibold text-slate-400 bg-white rounded-full px-2 py-0.5 border border-slate-200">
            {apps.length}
          </span>

          {/* Edit-mode controls */}
          {editMode && !editing && (
            <>
              <button
                onClick={() => setEditing(true)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-white/70 transition-colors"
              >
                <Pencil className="h-3 w-3" />
              </button>
              <button
                onClick={() => onDelete(stage.id)}
                className="p-1 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"
              >
                <X className="h-3 w-3" />
              </button>
            </>
          )}

          {/* ⋯ stage actions menu (always visible) */}
          {!editing && (
            <div className="relative">
              <button
                onClick={() => isMenuOpen ? onMenuClose() : onMenuOpen()}
                className={`p-1 rounded-lg transition-colors ${
                  isMenuOpen
                    ? 'bg-slate-200 text-slate-700'
                    : 'text-slate-400 hover:text-slate-700 hover:bg-white/70'
                }`}
                title="Stage actions"
              >
                <MoreHorizontal className="h-3.5 w-3.5" />
              </button>

              {isMenuOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={onMenuClose} />
                  <div className="absolute right-0 top-full mt-1 z-50 w-56 bg-white border border-slate-200 rounded-xl shadow-xl py-1 overflow-hidden">
                    <div className="px-3 py-1.5 text-xs font-semibold text-slate-400 uppercase tracking-wide border-b border-slate-100">
                      {stage.name}
                    </div>
                    {STAGE_ACTIONS.map((action, i) => {
                      if (action.id === 'divider1' || action.id === 'divider2') {
                        return <div key={i} className="my-1 border-t border-slate-100" />
                      }
                      const isDestructive = action.id === 'reject_all'
                      let label: string = action.label
                      if (action.id === 'schedule_interview') {
                        label = selectedInStage > 0 ? `Schedule interview (${selectedInStage} selected)` : action.label
                      } else if (action.id === 'move_next') {
                        label = selectedInStage > 0 ? `Move to next stage (${selectedInStage} selected)` : action.label
                      } else if (action.id === 'reject_all') {
                        label = selectedInStage > 0 ? `Reject (${selectedInStage} selected)` : action.label
                      }
                      return (
                        <button
                          key={action.id}
                          onClick={() => handleAction(action.id as StageActionId)}
                          className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm transition-colors text-left ${
                            isDestructive
                              ? 'text-red-600 hover:bg-red-50'
                              : 'text-slate-700 hover:bg-slate-50'
                          }`}
                        >
                          <span className="text-base leading-none w-4 text-center">{action.icon}</span>
                          {label}
                        </button>
                      )
                    })}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Color picker */}
      {showColors && editMode && (
        <div className="flex flex-wrap gap-1.5 px-3 py-2 bg-white border border-slate-200 rounded-xl mx-1 mt-1 shadow-sm z-10">
          {COLOR_OPTIONS.map(c => (
            <button
              key={c.value}
              onClick={() => { onRecolor(stage.id, c.value); setShowColors(false) }}
              className={`h-5 w-5 rounded-full ${c.dot} ${stage.color === c.value ? 'ring-2 ring-offset-1 ring-slate-500' : 'hover:scale-110'} transition-transform`}
              title={c.label}
            />
          ))}
        </div>
      )}

      {/* Cards */}
      <div className={`flex flex-col gap-2 p-2 min-h-[100px] ${over ? 'bg-slate-50/60 rounded-xl' : ''}`}>
        {apps.map(app => (
          <CandidateCard
            key={app.id}
            app={app}
            onDragStart={onDragStart}
            onClick={onCardClick}
            isSelected={selectedApps.has(app.id)}
            onToggleSelect={onToggleSelect}
          />
        ))}
        {apps.length === 0 && (
          <div className={`flex-1 rounded-xl border-2 border-dashed min-h-[80px] transition-colors ${
            over ? style.border : 'border-slate-100'
          }`} />
        )}
      </div>
    </div>
  )
}

// ── Add Candidate Modal ───────────────────────────────────────────────────────

function AddCandidateModal({
  jobId,
  stages,
  onClose,
  onAdded,
}: {
  jobId: string
  stages: PipelineStage[]
  onClose: () => void
  onAdded: () => void
}) {
  const [tab, setTab] = useState<'new' | 'search'>('new')
  const [stageId, setStageId] = useState(stages[0]?.id ?? '')
  const [source, setSource] = useState('manual')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // New candidate
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')

  // Search existing
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Candidate[]>([])
  const [searching, setSearching] = useState(false)

  const search = useCallback(async (q: string) => {
    if (!q.trim()) { setResults([]); return }
    setSearching(true)
    const res = await fetch(`/api/candidates?search=${encodeURIComponent(q)}&limit=10`)
    const json = await res.json()
    setResults(json.data ?? [])
    setSearching(false)
  }, [])

  useEffect(() => {
    const t = setTimeout(() => search(query), 300)
    return () => clearTimeout(t)
  }, [query, search])

  const addNew = async () => {
    if (!name.trim() || !email.trim()) { setError('Name and email are required'); return }
    setSaving(true); setError('')
    const res = await fetch('/api/applications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        hiring_request_id: jobId,
        stage_id: stageId || undefined,
        source,
        candidate_data: { name: name.trim(), email: email.trim(), phone: phone.trim() || undefined },
      }),
    })
    const json = await res.json()
    if (!res.ok) { setError(json.error ?? 'Failed to add'); setSaving(false); return }
    onAdded()
  }

  const addExisting = async (candidateId: string) => {
    setSaving(true); setError('')
    const res = await fetch('/api/applications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        hiring_request_id: jobId,
        stage_id: stageId || undefined,
        source: 'sourced',
        candidate_id: candidateId,
      }),
    })
    const json = await res.json()
    if (!res.ok) { setError(json.error ?? 'Failed to add'); setSaving(false); return }
    onAdded()
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-200">
          <h2 className="text-base font-bold text-slate-900">Add Candidate</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-200">
          {[{ key: 'new', label: 'New Candidate' }, { key: 'search', label: 'Search Existing' }].map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key as 'new' | 'search')}
              className={`flex-1 py-3 text-sm font-medium transition-colors ${
                tab === t.key
                  ? 'text-blue-700 border-b-2 border-blue-600'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="px-6 py-5 space-y-4">
          {/* Stage picker (both tabs) */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1.5">Add to Stage</label>
            <select
              value={stageId}
              onChange={e => setStageId(e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {stages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>

          {tab === 'new' && (
            <>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1.5">Name *</label>
                <input
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Jane Smith"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1.5">Email *</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="jane@example.com"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1.5">Phone</label>
                <input
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  placeholder="+1 (555) 000-0000"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1.5">Source</label>
                <select
                  value={source}
                  onChange={e => setSource(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="manual">Manual Add</option>
                  <option value="sourced">Sourced</option>
                  <option value="referral">Referral</option>
                  <option value="imported">Imported</option>
                </select>
              </div>
            </>
          )}

          {tab === 'search' && (
            <>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="Search by name or email…"
                  className="w-full rounded-xl border border-slate-200 pl-9 pr-4 py-2 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                {searching && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 animate-spin" />}
              </div>
              {results.length > 0 && (
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {results.map(c => (
                    <button
                      key={c.id}
                      onClick={() => addExisting(c.id)}
                      disabled={saving}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-slate-50 text-left transition-colors disabled:opacity-50"
                    >
                      <div className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 text-xs font-bold ${avatarColor(c.name)}`}>
                        {initials(c.name)}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-800 truncate">{c.name}</p>
                        <p className="text-xs text-slate-400 truncate">{c.email}</p>
                      </div>
                      {saving && <Loader2 className="h-4 w-4 text-slate-400 animate-spin ml-auto" />}
                    </button>
                  ))}
                </div>
              )}
              {query && !searching && results.length === 0 && (
                <p className="text-sm text-center text-slate-400 py-4">No candidates found</p>
              )}
            </>
          )}

          {error && (
            <div className="flex items-center gap-2 rounded-xl bg-red-50 border border-red-200 px-3 py-2">
              <AlertCircle className="h-4 w-4 text-red-500 shrink-0" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        {tab === 'new' && (
          <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-200">
            <button onClick={onClose} className="rounded-xl px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors">
              Cancel
            </button>
            <button
              onClick={addNew}
              disabled={saving}
              className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition-colors disabled:opacity-60"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Add to Pipeline
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Candidate Slide-Over ──────────────────────────────────────────────────────

function CandidateSlideOver({
  app,
  stages,
  onClose,
  onStageChange,
  onStatusChange,
}: {
  app: Application
  stages: PipelineStage[]
  onClose: () => void
  onStageChange: (appId: string, stageId: string) => void
  onStatusChange: (appId: string, status: string) => void
}) {
  const c = app.candidate!
  const [tab, setTab]   = useState<'details' | 'scorecards'>('details')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  // Scorecards tab state
  const [scorecards, setScorecards]         = useState<Scorecard[]>([])
  const [scLoading, setScLoading]           = useState(false)
  const [showAddForm, setShowAddForm]       = useState(false)
  const [scInterviewer, setScInterviewer]   = useState('')
  const [scRound, setScRound]               = useState('')
  const [scRec, setScRec]                   = useState<ScorecardRecommendation | ''>('')
  const [scScores, setScScores]             = useState(
    DEFAULT_CRITERIA.map(c => ({ criterion: c, rating: 0 as 0 | 1 | 2 | 3 | 4 }))
  )
  const [scNotes, setScNotes]               = useState('')
  const [scSaving, setScSaving]             = useState(false)
  const [scError, setScError]               = useState('')

  const loadScorecards = useCallback(async () => {
    setScLoading(true)
    const res = await fetch(`/api/scorecards?application_id=${app.id}`)
    const json = await res.json()
    setScorecards(json.data ?? [])
    setScLoading(false)
  }, [app.id])

  useEffect(() => {
    if (tab === 'scorecards') loadScorecards()
  }, [tab, loadScorecards])

  const addNote = async () => {
    if (!note.trim()) return
    setSaving(true)
    await fetch(`/api/applications/${app.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ note: note.trim() }),
    })
    setNote('')
    setSaving(false)
  }

  const submitScorecard = async () => {
    if (!scInterviewer.trim()) { setScError('Interviewer name is required'); return }
    if (!scRec)                 { setScError('Please select a recommendation'); return }
    const unrated = scScores.filter(s => s.rating === 0)
    if (unrated.length > 0)    { setScError(`Please rate: ${unrated.map(s => s.criterion).join(', ')}`); return }

    setScSaving(true); setScError('')
    const res = await fetch('/api/scorecards', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        application_id:   app.id,
        interviewer_name: scInterviewer.trim(),
        stage_name:       scRound.trim() || null,
        recommendation:   scRec,
        scores:           scScores.map(s => ({ criterion: s.criterion, rating: s.rating, notes: '' })) as ScorecardScore[],
        overall_notes:    scNotes.trim() || null,
      }),
    })
    setScSaving(false)
    if (!res.ok) { const j = await res.json(); setScError(j.error ?? 'Failed'); return }
    // Reset form
    setScInterviewer(''); setScRound(''); setScRec(''); setScNotes('')
    setScScores(DEFAULT_CRITERIA.map(c => ({ criterion: c, rating: 0 as 0 | 1 | 2 | 3 | 4 })))
    setShowAddForm(false)
    await loadScorecards()
  }

  const deleteScorecard = async (id: string) => {
    if (!confirm('Delete this scorecard?')) return
    await fetch(`/api/scorecards/${id}`, { method: 'DELETE' })
    setScorecards(prev => prev.filter(s => s.id !== id))
  }

  return (
    <div className="fixed inset-0 z-40 flex">
      <div className="flex-1" onClick={onClose} />
      <div className="w-[420px] bg-white border-l border-slate-200 shadow-2xl flex flex-col h-full overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between px-6 py-5 border-b border-slate-200 shrink-0">
          <div className="flex items-center gap-3">
            <div className={`h-10 w-10 rounded-full flex items-center justify-center text-sm font-bold ${avatarColor(c.name)}`}>
              {initials(c.name)}
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">{c.name}</h2>
              {c.current_title && <p className="text-sm text-slate-500">{c.current_title}</p>}
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors mt-0.5">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-200 shrink-0">
          {[
            { key: 'details',    label: 'Details'    },
            { key: 'scorecards', label: 'Scorecards', count: tab === 'scorecards' ? scorecards.length : null },
          ].map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key as 'details' | 'scorecards')}
              className={`flex items-center gap-1.5 flex-1 py-3 text-sm font-medium transition-colors ${
                tab === t.key
                  ? 'text-blue-700 border-b-2 border-blue-600'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              {t.label}
              {t.count != null && t.count > 0 && (
                <span className="rounded-full bg-violet-100 px-1.5 py-0.5 text-xs font-bold text-violet-700">
                  {t.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {tab === 'details' && (
            <div className="px-6 py-5 space-y-5">
              {/* Contact */}
              <div className="space-y-1.5 text-sm">
                <a href={`mailto:${c.email}`} className="flex items-center gap-2 text-blue-600 hover:text-blue-800 transition-colors">
                  {c.email}
                </a>
                {c.phone && <p className="text-slate-600">{c.phone}</p>}
                {c.location && <p className="text-slate-400">{c.location}</p>}
              </div>

              {/* Stage */}
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Stage</label>
                <div className="relative">
                  <select
                    value={app.stage_id ?? ''}
                    onChange={e => onStageChange(app.id, e.target.value)}
                    className="w-full appearance-none rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white pr-8"
                  >
                    {stages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-2">
                <button
                  onClick={() => onStatusChange(app.id, 'rejected')}
                  className="flex-1 rounded-xl border border-red-200 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
                >
                  Reject
                </button>
                <button
                  onClick={() => onStatusChange(app.id, 'withdrawn')}
                  className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
                >
                  Withdraw
                </button>
              </div>

              {/* Note */}
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Add Note</label>
                <textarea
                  value={note}
                  onChange={e => setNote(e.target.value)}
                  rows={3}
                  placeholder="Leave a note about this candidate…"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
                <button
                  onClick={addNote}
                  disabled={saving || !note.trim()}
                  className="mt-2 w-full rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 transition-colors disabled:opacity-50"
                >
                  {saving ? 'Saving…' : 'Save Note'}
                </button>
              </div>
            </div>
          )}

          {tab === 'scorecards' && (
            <div className="px-6 py-5 space-y-4">
              {/* Add Scorecard button / form toggle */}
              {!showAddForm && (
                <button
                  onClick={() => setShowAddForm(true)}
                  className="flex items-center gap-2 w-full rounded-xl border-2 border-dashed border-violet-200 px-4 py-3 text-sm font-medium text-violet-600 hover:bg-violet-50 hover:border-violet-300 transition-colors"
                >
                  <Plus className="h-4 w-4" />
                  Add Scorecard
                </button>
              )}

              {/* Inline scorecard form */}
              {showAddForm && (
                <div className="rounded-xl border border-violet-200 bg-violet-50/50 p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-bold text-slate-800">New Scorecard</p>
                    <button onClick={() => { setShowAddForm(false); setScError('') }} className="p-1 text-slate-400 hover:text-slate-700">
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 mb-1">Interviewer *</label>
                      <input
                        value={scInterviewer}
                        onChange={e => setScInterviewer(e.target.value)}
                        placeholder="Jane Smith"
                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-400"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 mb-1">Round</label>
                      <input
                        value={scRound}
                        onChange={e => setScRound(e.target.value)}
                        placeholder="Phone Screen"
                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-400"
                      />
                    </div>
                  </div>

                  {/* Criteria */}
                  <div className="space-y-3">
                    <p className="text-xs font-semibold text-slate-500">Criteria *</p>
                    {scScores.map((s, idx) => (
                      <div key={s.criterion}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs text-slate-600">{s.criterion}</span>
                          {s.rating > 0 && (
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${RATING_CONFIG[s.rating - 1].active}`}>
                              {RATING_CONFIG[s.rating - 1].label}
                            </span>
                          )}
                        </div>
                        <div className="flex gap-1.5">
                          {RATING_CONFIG.map(r => (
                            <button
                              key={r.value}
                              onClick={() => setScScores(prev => prev.map((sc, i) => i === idx ? { ...sc, rating: r.value } : sc))}
                              className={`flex-1 rounded-lg px-1 py-1.5 text-[10px] font-semibold border transition-all ${
                                s.rating === r.value ? r.active : r.btn
                              }`}
                            >
                              {r.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Recommendation */}
                  <div>
                    <p className="text-xs font-semibold text-slate-500 mb-2">Recommendation *</p>
                    <div className="grid grid-cols-2 gap-1.5">
                      {(Object.entries(RECOMMENDATION_CONFIG) as [ScorecardRecommendation, typeof RECOMMENDATION_CONFIG[ScorecardRecommendation]][]).map(([key, cfg]) => (
                        <button
                          key={key}
                          onClick={() => setScRec(key)}
                          className={`rounded-lg px-2 py-2 text-xs font-semibold border transition-all ${
                            scRec === key ? cfg.active : cfg.btn
                          }`}
                        >
                          {cfg.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Notes */}
                  <textarea
                    value={scNotes}
                    onChange={e => setScNotes(e.target.value)}
                    rows={2}
                    placeholder="Overall notes (optional)…"
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-400 resize-none"
                  />

                  {scError && (
                    <div className="flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2">
                      <AlertCircle className="h-3.5 w-3.5 text-red-500 shrink-0" />
                      <p className="text-xs text-red-700">{scError}</p>
                    </div>
                  )}

                  <button
                    onClick={submitScorecard}
                    disabled={scSaving}
                    className="flex items-center justify-center gap-2 w-full rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-700 transition-colors disabled:opacity-60"
                  >
                    {scSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ClipboardList className="h-4 w-4" />}
                    Submit Scorecard
                  </button>
                </div>
              )}

              {/* Scorecards list */}
              {scLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-slate-300" />
                </div>
              ) : scorecards.length === 0 && !showAddForm ? (
                <div className="flex flex-col items-center py-10 text-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-violet-50 text-violet-300 mb-3">
                    <Star className="h-6 w-6" />
                  </div>
                  <p className="text-sm font-medium text-slate-500">No scorecards yet</p>
                  <p className="text-xs text-slate-400 mt-1">Add feedback after the interview</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {scorecards.map(sc => {
                    const rec = RECOMMENDATION_CONFIG[sc.recommendation]
                    return (
                      <div key={sc.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${rec.badge}`}>{rec.label}</span>
                            <span className="text-xs font-semibold text-slate-700">{sc.interviewer_name}</span>
                            {sc.stage_name && <span className="text-xs text-slate-400">· {sc.stage_name}</span>}
                            <span className="text-xs text-slate-300">· {fmtRelative(sc.created_at)}</span>
                          </div>
                          <button
                            onClick={() => deleteScorecard(sc.id)}
                            className="p-1 text-slate-300 hover:text-red-500 transition-colors shrink-0"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        {sc.scores.length > 0 && (
                          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                            {sc.scores.map(s => (
                              <div key={s.criterion} className="flex items-center justify-between gap-1">
                                <span className="text-xs text-slate-500 truncate">{s.criterion}</span>
                                <RatingDots rating={s.rating} />
                              </div>
                            ))}
                          </div>
                        )}
                        {sc.overall_notes && (
                          <p className="text-xs text-slate-500 bg-white rounded-lg border border-slate-100 px-2.5 py-1.5">
                            {sc.overall_notes}
                          </p>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-slate-200 px-6 py-4 shrink-0">
          <a
            href={`/candidates/${c.id}`}
            className="flex items-center justify-center gap-2 w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
          >
            View Full Profile
            <ExternalLink className="h-4 w-4 text-slate-400" />
          </a>
        </div>
      </div>
    </div>
  )
}

// ── Ranked View ───────────────────────────────────────────────────────────────

function RankedView({
  apps,
  stages,
  onCardClick,
  onMoveToStage,
  selectedApps,
  onToggleSelect,
}: {
  apps: Application[]
  stages: PipelineStage[]
  onCardClick: (app: Application) => void
  onMoveToStage: (appId: string, stageId: string) => void
  selectedApps: Set<string>
  onToggleSelect: (id: string) => void
}) {
  const sorted = [...apps].sort((a, b) => {
    if (a.ai_score === null && b.ai_score === null) return 0
    if (a.ai_score === null) return 1
    if (b.ai_score === null) return -1
    return b.ai_score - a.ai_score
  })

  let scoredRank = 0

  return (
    <div className="px-8 py-6 flex-1">
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50/60">
              <th className="px-4 py-3 w-10" />
              <th className="text-left text-xs font-semibold text-slate-400 px-4 py-3 w-10">#</th>
              <th className="text-left text-xs font-semibold text-slate-400 px-4 py-3">Candidate</th>
              <th className="text-left text-xs font-semibold text-slate-400 px-4 py-3">Score</th>
              <th className="text-left text-xs font-semibold text-slate-400 px-4 py-3">AI Signal</th>
              <th className="text-left text-xs font-semibold text-slate-400 px-4 py-3">Stage</th>
              <th className="text-left text-xs font-semibold text-slate-400 px-4 py-3">Source</th>
              <th className="text-left text-xs font-semibold text-slate-400 px-4 py-3">Days</th>
              <th className="text-left text-xs font-semibold text-slate-400 px-4 py-3 w-44">Suggestion</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(app => {
              const c = app.candidate!
              const stage = stages.find(s => s.id === app.stage_id)
              const rec = app.ai_recommendation ? AI_REC_CONFIG[app.ai_recommendation] : null
              if (app.ai_score !== null) scoredRank++
              const rank = app.ai_score !== null ? scoredRank : null
              const isSelected = selectedApps.has(app.id)

              const currentStageIdx = stages.findIndex(s => s.id === app.stage_id)
              const nextStage = currentStageIdx >= 0 && currentStageIdx < stages.length - 1
                ? stages[currentStageIdx + 1]
                : null
              const isLastStage = currentStageIdx === stages.length - 1

              return (
                <tr
                  key={app.id}
                  onClick={() => onCardClick(app)}
                  className={`border-b border-slate-50 cursor-pointer transition-colors last:border-0 ${
                    isSelected ? 'bg-blue-50' : 'hover:bg-slate-50'
                  }`}
                >
                  <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                    <div
                      onClick={e => { e.stopPropagation(); onToggleSelect(app.id) }}
                      className={`h-4 w-4 rounded border flex items-center justify-center shrink-0 cursor-pointer transition-colors ${
                        isSelected ? 'bg-blue-500 border-blue-500' : 'border-slate-300 hover:border-blue-400 bg-white'
                      }`}
                    >
                      {isSelected && <Check className="h-2.5 w-2.5 text-white" />}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs font-bold text-slate-400 w-10">
                    {rank !== null ? rank : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <div className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 text-xs font-bold ${avatarColor(c.name)}`}>
                        {initials(c.name)}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{c.name}</p>
                        {c.current_title && (
                          <p className="text-xs text-slate-400">{c.current_title}</p>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {app.ai_score !== null
                      ? <ScorePill score={app.ai_score} />
                      : <span className="text-xs text-slate-300">—</span>
                    }
                  </td>
                  <td className="px-4 py-3">
                    {rec
                      ? <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${rec.cls}`}>{rec.label}</span>
                      : <span className="text-xs text-slate-300">—</span>
                    }
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-600">
                    {stage?.name ?? <span className="text-slate-300">Unstaged</span>}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${SOURCE_COLORS[app.source] ?? SOURCE_COLORS.manual}`}>
                      {SOURCE_LABELS[app.source] ?? app.source}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-400">
                    {daysSince(app.applied_at)}d
                  </td>
                  <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                    {app.ai_score === null ? (
                      <span className="text-xs text-slate-400 italic">Score to unlock suggestion</span>
                    ) : isLastStage ? (
                      <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 border border-emerald-200 px-2.5 py-1 text-xs font-medium text-emerald-700">
                        🏁 Final stage
                      </span>
                    ) : nextStage ? (
                      <button
                        onClick={() => onMoveToStage(app.id, nextStage.id)}
                        className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
                          (app.ai_score ?? 0) >= 70
                            ? 'border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100'
                            : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        → Move to {nextStage.name}
                      </button>
                    ) : null}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {sorted.length === 0 && (
          <div className="py-16 text-center text-sm text-slate-400">No active candidates</div>
        )}
      </div>
    </div>
  )
}

// ── Autopilot Drawer ──────────────────────────────────────────────────────────

function AutopilotDrawer({
  job,
  stages,
  onClose,
  onSaved,
}: {
  job: JobWithPipeline
  stages: PipelineStage[]
  onClose: () => void
  onSaved: () => void
}) {
  const [advanceScore,   setAdvanceScore]   = useState<number>(job.auto_advance_score   ?? 75)
  const [rejectScore,    setRejectScore]    = useState<number>(job.auto_reject_score    ?? 40)
  const [advanceStageId, setAdvanceStageId] = useState<string>(job.auto_advance_stage_id ?? (stages[1]?.id ?? stages[0]?.id ?? ''))
  const [autoEmail,      setAutoEmail]      = useState<boolean>(job.auto_email_rejection ?? false)
  const [recruiterName,  setRecruiterName]  = useState<string>(job.autopilot_recruiter_name ?? '')
  const [companyName,    setCompanyName]    = useState<string>(job.autopilot_company_name   ?? '')
  const [saving,  setSaving]  = useState(false)
  const [error,   setError]   = useState('')

  const isActive = job.auto_advance_score !== null || job.auto_reject_score !== null

  const save = async () => {
    setSaving(true); setError('')
    const res = await fetch(`/api/jobs/${job.id}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        auto_advance_score:       advanceScore,
        auto_reject_score:        rejectScore,
        auto_advance_stage_id:    advanceStageId || null,
        auto_email_rejection:     autoEmail,
        autopilot_recruiter_name: recruiterName.trim() || null,
        autopilot_company_name:   companyName.trim()   || null,
      }),
    })
    setSaving(false)
    if (!res.ok) { setError('Failed to save settings'); return }
    onSaved()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-40 flex">
      <div className="flex-1" onClick={onClose} />
      <div className="w-[380px] bg-white border-l border-slate-200 shadow-2xl flex flex-col h-full overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-200 shrink-0">
          <div className="flex items-center gap-2">
            <Settings2 className="h-5 w-5 text-slate-500" />
            <h2 className="text-base font-bold text-slate-900">Autopilot</h2>
            {isActive && (
              <span className="flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 inline-block" />
                ON
              </span>
            )}
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">

          {/* Auto-advance */}
          <div className="space-y-3">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">Auto-Advance</p>
            <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-4 space-y-3">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm text-slate-700">Score ≥</span>
                <input
                  type="number" min={0} max={100}
                  value={advanceScore}
                  onChange={e => setAdvanceScore(Math.max(0, Math.min(100, +e.target.value)))}
                  className="w-16 rounded-lg border border-emerald-300 bg-white px-2 py-1 text-sm text-center font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-400"
                />
                <span className="text-sm text-slate-700">→ Move to</span>
              </div>
              <select
                value={advanceStageId}
                onChange={e => setAdvanceStageId(e.target.value)}
                className="w-full rounded-xl border border-emerald-300 bg-white px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-400"
              >
                <option value="">— Select stage —</option>
                {stages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          </div>

          {/* Auto-reject */}
          <div className="space-y-3">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">Auto-Reject</p>
            <div className="rounded-xl bg-red-50 border border-red-200 p-4">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm text-slate-700">Score ≤</span>
                <input
                  type="number" min={0} max={100}
                  value={rejectScore}
                  onChange={e => setRejectScore(Math.max(0, Math.min(100, +e.target.value)))}
                  className="w-16 rounded-lg border border-red-300 bg-white px-2 py-1 text-sm text-center font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-red-400"
                />
                <span className="text-sm text-slate-700">→ Reject application</span>
              </div>
            </div>
          </div>

          {/* Rejection email */}
          <div className="space-y-3">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">Rejection Email</p>
            <div className="rounded-xl border border-slate-200 p-4 space-y-4">
              <label className="flex items-center justify-between cursor-pointer gap-3">
                <span className="text-sm text-slate-700">Send rejection email automatically</span>
                <button
                  type="button"
                  onClick={() => setAutoEmail(v => !v)}
                  className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${autoEmail ? 'bg-blue-600' : 'bg-slate-200'}`}
                >
                  <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${autoEmail ? 'translate-x-4' : 'translate-x-0.5'}`} />
                </button>
              </label>
              {autoEmail && (
                <div className="space-y-3 pt-1">
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1.5">Recruiter Name</label>
                    <input
                      value={recruiterName}
                      onChange={e => setRecruiterName(e.target.value)}
                      placeholder="e.g. Priya Sharma"
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1.5">Company Name</label>
                    <input
                      value={companyName}
                      onChange={e => setCompanyName(e.target.value)}
                      placeholder="e.g. TalentOS"
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <p className="text-xs text-slate-400 italic">
                    Emails will be signed: &quot;Best, {recruiterName || 'The Recruiting Team'}{companyName ? ` · ${companyName}` : ''}&quot;
                  </p>
                </div>
              )}
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 rounded-xl bg-red-50 border border-red-200 px-3 py-2">
              <AlertCircle className="h-4 w-4 text-red-500 shrink-0" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-slate-200 px-6 py-4 shrink-0 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 transition-colors disabled:opacity-60"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Save Settings
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Schedule Interview Modal ───────────────────────────────────────────────────

const INTERVIEW_TYPES = [
  { value: 'video',      label: '🎥 Video call'     },
  { value: 'phone',      label: '📞 Phone screen'   },
  { value: 'in_person',  label: '🏢 In-person'      },
  { value: 'panel',      label: '👥 Panel'           },
  { value: 'technical',  label: '💻 Technical'       },
  { value: 'assessment', label: '📋 Assessment'      },
] as const

const DURATION_OPTIONS = [
  { value: 30,  label: '30 min' },
  { value: 45,  label: '45 min' },
  { value: 60,  label: '1 hour' },
  { value: 90,  label: '90 min' },
  { value: 120, label: '2 hours' },
]

function ScheduleInterviewModal({
  apps,
  job,
  stages,
  onClose,
  onScheduled,
}: {
  apps: Application[]
  job: JobWithPipeline
  stages: PipelineStage[]
  onClose: () => void
  onScheduled: () => void
}) {
  const today = new Date()
  const defaultDate = new Date(today.getTime() + 86400000) // tomorrow
  const dateStr = defaultDate.toISOString().split('T')[0]

  const [interviewType, setInterviewType] = useState<string>('video')
  const [date, setDate] = useState(dateStr)
  const [time, setTime] = useState('10:00')
  const [duration, setDuration] = useState(60)
  const [interviewer, setInterviewer] = useState(job.hiring_manager_name ?? '')
  const [location, setLocation] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async () => {
    if (!date || !time || !interviewer.trim()) {
      setError('Date, time and interviewer are required.')
      return
    }
    setSaving(true)
    setError('')

    const scheduled_at = new Date(`${date}T${time}:00`).toISOString()

    try {
      const results = await Promise.all(apps.map(app =>
        fetch('/api/interviews', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            application_id:   app.id,
            candidate_id:     app.candidate_id,
            hiring_request_id: job.id,
            stage_id:         app.stage_id ?? null,
            interviewer_name: interviewer.trim(),
            interview_type:   interviewType,
            scheduled_at,
            duration_minutes: duration,
            location:         location.trim() || null,
            notes:            notes.trim() || null,
          }),
        }).then(r => r.json())
      ))

      const hasError = results.some(r => r.error)
      if (hasError) {
        const firstErr = results.find(r => r.error)
        setError(firstErr?.error ?? 'Failed to schedule some interviews')
        setSaving(false)
        return
      }

      setSaved(true)
      setTimeout(() => { onScheduled(); onClose() }, 1200)
    } catch {
      setError('Network error. Please try again.')
      setSaving(false)
    }
  }

  const fmtDate = (d: string) => d
    ? new Date(d + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
    : ''

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div>
            <h2 className="text-base font-bold text-slate-900">Schedule Interview</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              {apps.length === 1
                ? `Scheduling for ${apps[0].candidate?.name}`
                : `Scheduling for ${apps.length} candidates`}
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4 max-h-[70vh] overflow-y-auto">
          {/* Candidates list */}
          {apps.length > 1 && (
            <div className="flex flex-wrap gap-1.5">
              {apps.map(app => (
                <span key={app.id} className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
                  <div className={`h-4 w-4 rounded-full flex items-center justify-center text-[9px] font-bold ${avatarColor(app.candidate?.name ?? '')}`}>
                    {initials(app.candidate?.name ?? '?')}
                  </div>
                  {app.candidate?.name}
                </span>
              ))}
            </div>
          )}

          {/* Interview type */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Interview type</label>
            <div className="grid grid-cols-3 gap-1.5">
              {INTERVIEW_TYPES.map(t => (
                <button
                  key={t.value}
                  onClick={() => setInterviewType(t.value)}
                  className={`px-2.5 py-2 rounded-xl border text-xs font-medium transition-colors text-left ${
                    interviewType === t.value
                      ? 'border-blue-400 bg-blue-50 text-blue-700'
                      : 'border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Date + Time */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Date</label>
              <input
                type="date"
                value={date}
                min={new Date().toISOString().split('T')[0]}
                onChange={e => setDate(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
              {date && <p className="text-xs text-slate-400 mt-1">{fmtDate(date)}</p>}
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Time</label>
              <input
                type="time"
                value={time}
                onChange={e => setTime(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>
          </div>

          {/* Duration */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Duration</label>
            <div className="flex gap-1.5">
              {DURATION_OPTIONS.map(d => (
                <button
                  key={d.value}
                  onClick={() => setDuration(d.value)}
                  className={`flex-1 px-2 py-2 rounded-xl border text-xs font-medium transition-colors ${
                    duration === d.value
                      ? 'border-blue-400 bg-blue-50 text-blue-700'
                      : 'border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>

          {/* Interviewer */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Interviewer</label>
            <input
              value={interviewer}
              onChange={e => setInterviewer(e.target.value)}
              placeholder="Hiring manager name"
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>

          {/* Location / Meeting link */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">
              {interviewType === 'in_person' ? 'Location / Address' : 'Meeting link'}
            </label>
            <input
              value={location}
              onChange={e => setLocation(e.target.value)}
              placeholder={interviewType === 'in_person' ? 'e.g. 4th floor, conference room B' : 'e.g. https://zoom.us/j/...'}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Notes <span className="font-normal text-slate-400">(optional)</span></label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              placeholder="Topics to cover, prep instructions…"
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none"
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 rounded-xl bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-3 px-6 py-4 border-t border-slate-100 bg-slate-50/60">
          <button
            onClick={onClose}
            className="flex-1 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-white transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving || saved}
            className={`flex-1 flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors ${
              saved
                ? 'bg-emerald-500 text-white'
                : 'bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-60'
            }`}
          >
            {saved ? (
              <><Check className="h-4 w-4" /> Scheduled!</>
            ) : saving ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Scheduling…</>
            ) : (
              `Schedule ${apps.length > 1 ? `${apps.length} interviews` : 'interview'}`
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function JobPipelinePage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()

  const [job, setJob] = useState<JobWithPipeline | null>(null)
  const [loading, setLoading] = useState(true)
  const [editMode, setEditMode] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [newStageName, setNewStageName] = useState('')
  const [addingStage, setAddingStage] = useState(false)
  const [selectedApp, setSelectedApp] = useState<Application | null>(null)
  const [copied, setCopied] = useState(false)
  const dragId    = useRef<string | null>(null)
  // Prevents load() from overwriting scored state with stale server data.
  // Set to true at scoring start; cleared 5 s after scoring ends so that
  // the visibilitychange / switchView refetch guards don't live forever.
  const scoringRef = useRef(false)

  // View mode
  const [viewMode, setViewMode] = useState<'kanban' | 'ranked'>('kanban')

  // Autopilot drawer
  const [showAutopilot, setShowAutopilot] = useState(false)

  // Kanban filter / sort state
  const [filterSearch, setFilterSearch] = useState('')
  const [filterSource, setFilterSource] = useState('all')
  const [sortBy, setSortBy] = useState<'date' | 'score' | 'name'>('date')
  const [openStageMenu, setOpenStageMenu] = useState<string | null>(null)
  const [selectedApps, setSelectedApps] = useState<Set<string>>(new Set())
  const toggleSelect = (appId: string) => setSelectedApps(prev => {
    const next = new Set(prev)
    if (next.has(appId)) next.delete(appId); else next.add(appId)
    return next
  })
  const clearSelection = () => setSelectedApps(new Set())
  const [showMoreMenu, setShowMoreMenu] = useState(false)
  const [scheduleModalApps, setScheduleModalApps] = useState<Application[] | null>(null)

  // Scoring state
  const [scoring, setScoring] = useState(false)
  const [scoreProgress, setScoreProgress] = useState<{ done: number; total: number }>({ done: 0, total: 0 })
  const [scoreResult,   setScoreResult]   = useState<{ scored: number; errors: number; first_error: string | null; auto_advanced: number; auto_rejected: number; emails_sent: number } | null>(null)
  const [scoreError,    setScoreError]    = useState('')

  const load = useCallback(async () => {
    // Never stomp on live scoring state — scores are patched directly from SSE
    // events and a stale server response would wipe them.
    if (scoringRef.current) return
    const res = await fetch(`/api/jobs/${id}`, { cache: 'no-store' })
    const json = await res.json()
    setJob(json.data ?? null)
    setLoading(false)
  }, [id])

  const switchView = useCallback((mode: 'kanban' | 'ranked') => {
    setViewMode(mode)
    // No load() here — job data is already in state; scores come from SSE patches,
    // not from a server refetch, so fetching would risk overwriting them.
  }, [])

  useEffect(() => { load() }, [load])

  // Refetch when tab regains focus so drag-and-drop from another tab stays in sync
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') load() }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [load])

  const activeApps = job?.applications.filter(a => a.status === 'active') ?? []

  const grouped = (job?.pipeline_stages ?? []).reduce<Record<string, Application[]>>((acc, s) => {
    acc[s.id] = activeApps.filter(a => a.stage_id === s.id)
    return acc
  }, {})
  const unstaged = activeApps.filter(a => !a.stage_id)

  // Filtered + sorted view of grouped (for kanban display)
  const filteredGrouped = useMemo(() => {
    const result: Record<string, Application[]> = {}
    for (const [sid, apps] of Object.entries(grouped)) {
      let filtered = apps
      if (filterSearch.trim()) {
        const q = filterSearch.toLowerCase()
        filtered = filtered.filter(a => (a.candidate?.name ?? '').toLowerCase().includes(q))
      }
      if (filterSource !== 'all') {
        filtered = filtered.filter(a => a.source === filterSource)
      }
      if (sortBy === 'score') {
        filtered = [...filtered].sort((a, b) => (b.ai_score ?? -1) - (a.ai_score ?? -1))
      } else if (sortBy === 'name') {
        filtered = [...filtered].sort((a, b) =>
          (a.candidate?.name ?? '').localeCompare(b.candidate?.name ?? ''))
      }
      result[sid] = filtered
    }
    return result
  }, [grouped, filterSearch, filterSource, sortBy])

  // ── Drag & Drop ──────────────────────────────────────────────────────────
  const handleDrop = async (newStageId: string) => {
    const appId = dragId.current
    if (!appId) return
    const app = job?.applications.find(a => a.id === appId)
    if (!app || app.stage_id === newStageId) { dragId.current = null; return }

    // Optimistic update
    setJob(prev => prev ? {
      ...prev,
      applications: prev.applications.map(a =>
        a.id === appId ? { ...a, stage_id: newStageId } : a
      ),
    } : prev)

    await fetch(`/api/applications/${appId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stage_id: newStageId }),
    })

    dragId.current = null
  }

  // ── Stage management ──────────────────────────────────────────────────────
  const callStagesApi = async (body: Record<string, unknown>) => {
    const res = await fetch(`/api/jobs/${id}/stages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    return res.ok
  }

  const handleAddStage = async () => {
    if (!newStageName.trim()) return
    setAddingStage(true)
    const res = await fetch(`/api/jobs/${id}/stages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'create', name: newStageName.trim(), color: 'blue' }),
    })
    if (res.ok) {
      setNewStageName('')
      await load()
    }
    setAddingStage(false)
  }

  const handleRename = async (stageId: string, name: string) => {
    setJob(prev => prev ? {
      ...prev,
      pipeline_stages: prev.pipeline_stages.map(s => s.id === stageId ? { ...s, name } : s),
    } : prev)
    await callStagesApi({ action: 'update', id: stageId, name })
  }

  const handleRecolor = async (stageId: string, color: StageColor) => {
    setJob(prev => prev ? {
      ...prev,
      pipeline_stages: prev.pipeline_stages.map(s => s.id === stageId ? { ...s, color } : s),
    } : prev)
    await callStagesApi({ action: 'update', id: stageId, color })
  }

  const handleDeleteStage = async (stageId: string) => {
    if (!confirm('Delete this stage? Candidates in it will become unstaged.')) return
    setJob(prev => prev ? {
      ...prev,
      pipeline_stages: prev.pipeline_stages.filter(s => s.id !== stageId),
      applications: prev.applications.map(a => a.stage_id === stageId ? { ...a, stage_id: null } : a),
    } : prev)
    await callStagesApi({ action: 'delete', id: stageId })
  }

  // ── Stage change from slide-over ──────────────────────────────────────────
  const handleStageChange = async (appId: string, stageId: string) => {
    setJob(prev => prev ? {
      ...prev,
      applications: prev.applications.map(a => a.id === appId ? { ...a, stage_id: stageId } : a),
    } : prev)
    setSelectedApp(prev => prev && prev.id === appId ? { ...prev, stage_id: stageId } : prev)
    await fetch(`/api/applications/${appId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stage_id: stageId }),
    })
  }

  const handleStatusChange = async (appId: string, status: string) => {
    setJob(prev => prev ? {
      ...prev,
      applications: prev.applications.map(a =>
        a.id === appId ? { ...a, status: status as Application['status'] } : a
      ),
    } : prev)
    setSelectedApp(null)
    await fetch(`/api/applications/${appId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
  }

  const copyApplyLink = () => {
    if (!job?.apply_link_token) return
    const url = `${window.location.origin}/apply/${job.apply_link_token}`
    navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const startScoring = async (stageId?: string) => {
    if (scoring) return
    const appsToScore = stageId ? (grouped[stageId] ?? []) : activeApps
    const total = appsToScore.length
    if (total === 0) return

    scoringRef.current = true   // block load() for the duration of scoring
    setScoring(true)
    setScoreError('')
    setScoreResult(null)
    setScoreProgress({ done: 0, total })

    try {
      const res = await fetch(`/api/jobs/${id}/score`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(stageId ? { stage_id: stageId } : {}),
      })
      if (!res.ok || !res.body) {
        const j = await res.json().catch(() => ({}))
        setScoreError((j as { error?: string }).error ?? 'Scoring failed')
        setScoring(false)
        return
      }

      const reader = res.body.getReader()
      const dec    = new TextDecoder()
      let   buf    = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += dec.decode(value, { stream: true })

        // SSE frames are separated by \n\n
        const frames = buf.split('\n\n')
        buf = frames.pop() ?? ''

        for (const frame of frames) {
          const line = frame.replace(/^data: /, '').trim()
          if (!line) continue
          try {
            const evt = JSON.parse(line) as Record<string, unknown>
            if (evt.type === 'progress') {
              setScoreProgress(prev => ({ ...prev, done: prev.done + 1 }))

              const appId  = evt.application_id as string
              const score  = evt.score          as number
              const rec    = evt.recommendation as Application['ai_recommendation']
              const action = evt.action         as 'advanced' | 'rejected' | 'none'
              const strengths = (evt.strengths as string[] | undefined) ?? []
              const gaps      = (evt.gaps      as string[] | undefined) ?? []

              // Patch everything directly into React state — no server refetch needed.
              // This is the only reliable approach: the SSE event IS the ground truth
              // (it fires right after the DB write succeeds), so we never need to
              // round-trip back to the server and risk stale-cache overwrites.
              setJob(prev => {
                if (!prev) return prev
                return {
                  ...prev,
                  applications: prev.applications.map(a => {
                    if (a.id !== appId) return a
                    const updated: Application = {
                      ...a,
                      ai_score:          score,
                      ai_recommendation: rec,
                      ai_strengths:      strengths,
                      ai_gaps:           gaps,
                      ai_scored_at:      new Date().toISOString(),
                    }
                    if (action === 'advanced' && prev.auto_advance_stage_id) {
                      updated.stage_id = prev.auto_advance_stage_id
                    }
                    if (action === 'rejected') {
                      updated.status = 'rejected'
                    }
                    return updated
                  }),
                }
              })
            } else if (evt.type === 'complete') {
              setScoreResult({
                scored:        (evt.scored        as number) ?? 0,
                errors:        (evt.errors        as number) ?? 0,
                first_error:   (evt.first_error   as string | null) ?? null,
                auto_advanced: (evt.auto_advanced as number) ?? 0,
                auto_rejected: (evt.auto_rejected as number) ?? 0,
                emails_sent:   (evt.emails_sent   as number) ?? 0,
              })
              // No load() here — all state was already patched per-candidate above.
              // Calling load() would risk a stale-cache overwrite that erases scores.
            }
          } catch { /* ignore malformed frames */ }
        }
      }
    } catch (err) {
      setScoreError(err instanceof Error ? err.message : 'Scoring failed')
    } finally {
      setScoring(false)
      // Keep load() suppressed for 5 s so that a visibilitychange or tab-switch
      // that fires right after scoring can't fetch stale data and overwrite scores.
      setTimeout(() => { scoringRef.current = false }, 5000)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen text-slate-400 text-sm gap-2">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading pipeline…
      </div>
    )
  }

  if (!job) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen text-slate-400 text-sm gap-2">
        <AlertCircle className="h-6 w-6" />
        Job not found.
      </div>
    )
  }

  return (
    <div className="flex flex-col min-h-full">
      {/* Top bar */}
      <div className="flex items-center justify-between px-8 py-5 border-b border-slate-200 bg-white sticky top-0 z-30">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.push('/jobs')}
            className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Jobs
          </button>
          <div className="h-5 w-px bg-slate-200" />
          <div>
            <h1 className="text-lg font-bold text-slate-900 leading-tight">{job.position_title}</h1>
            {(job.department || job.location) && (
              <p className="text-xs text-slate-400 mt-0.5">
                {[job.department, job.location].filter(Boolean).join(' · ')}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
              <Users className="h-3.5 w-3.5" />
              {activeApps.length} in pipeline
            </span>
            {job.ticket_number && (
              <span className="font-mono text-xs text-slate-400 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1">
                {job.ticket_number}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {/* View toggle */}
          <div className="flex items-center rounded-xl border border-slate-200 p-0.5 bg-slate-50">
            <button
              onClick={() => switchView('kanban')}
              className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
                viewMode === 'kanban' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <Kanban className="h-3.5 w-3.5" />
              Kanban
            </button>
            <button
              onClick={() => switchView('ranked')}
              className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
                viewMode === 'ranked' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <LayoutList className="h-3.5 w-3.5" />
              Ranked
            </button>
          </div>

          <div className="h-5 w-px bg-slate-200 hidden xl:block" />

          {/* Autopilot — inline on xl+ */}
          <button
            onClick={() => setShowAutopilot(true)}
            className={`hidden xl:flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium transition-colors border ${
              job.auto_advance_score !== null || job.auto_reject_score !== null
                ? 'border-emerald-200 text-emerald-700 bg-emerald-50 hover:bg-emerald-100'
                : 'border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            <Settings2 className="h-4 w-4" />
            Autopilot
            {(job.auto_advance_score !== null || job.auto_reject_score !== null) && (
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            )}
          </button>

          {/* Edit Stages — inline on xl+ */}
          <button
            onClick={() => setEditMode(e => !e)}
            className={`hidden xl:flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition-colors ${
              editMode
                ? 'bg-blue-600 text-white hover:bg-blue-700'
                : 'border border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            {editMode ? <><Check className="h-4 w-4" /> Done</> : <><Pencil className="h-4 w-4" /> Edit Stages</>}
          </button>

          {/* Apply Link — inline on xl+ */}
          <button
            onClick={copyApplyLink}
            className="hidden xl:flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
          >
            {copied ? <><Check className="h-4 w-4 text-emerald-500" /> Copied!</> : <><Link2 className="h-4 w-4" /> Apply Link</>}
          </button>

          {/* ⋯ More — visible below xl, collapses Autopilot/Edit/Apply */}
          <div className="relative xl:hidden">
            <button
              onClick={() => setShowMoreMenu(m => !m)}
              className="flex items-center gap-1 rounded-xl border border-slate-200 px-2.5 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
            {showMoreMenu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowMoreMenu(false)} />
                <div className="absolute right-0 top-full mt-1 z-50 w-52 bg-white border border-slate-200 rounded-xl shadow-xl py-1">
                  <button
                    onClick={() => { setShowAutopilot(true); setShowMoreMenu(false) }}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                  >
                    <Settings2 className="h-4 w-4 text-slate-400" />
                    Autopilot
                    {(job.auto_advance_score !== null || job.auto_reject_score !== null) && (
                      <span className="ml-auto h-2 w-2 rounded-full bg-emerald-500" />
                    )}
                  </button>
                  <button
                    onClick={() => { setEditMode(e => !e); setShowMoreMenu(false) }}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                  >
                    <Pencil className="h-4 w-4 text-slate-400" />
                    {editMode ? 'Done editing' : 'Edit Stages'}
                  </button>
                  <button
                    onClick={() => { copyApplyLink(); setShowMoreMenu(false) }}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                  >
                    <Link2 className="h-4 w-4 text-slate-400" />
                    {copied ? 'Copied!' : 'Copy Apply Link'}
                  </button>
                </div>
              </>
            )}
          </div>

          <button
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition-colors shadow-sm"
          >
            <UserPlus className="h-4 w-4" />
            Add Candidate
          </button>
        </div>
      </div>

      {/* Score progress / result banner */}
      {(scoring || scoreResult || scoreError) && (
        <div className={`px-8 py-3 border-b flex items-center gap-3 text-sm ${
          scoreError                                          ? 'bg-red-50 border-red-200 text-red-700'         :
          scoreResult && scoreResult.errors > 0 && scoreResult.scored === 0 ? 'bg-red-50 border-red-200 text-red-700' :
          scoreResult && scoreResult.errors > 0              ? 'bg-amber-50 border-amber-200 text-amber-800'   :
          scoreResult                                        ? 'bg-emerald-50 border-emerald-200 text-emerald-800' :
                                                               'bg-violet-50 border-violet-200 text-violet-700'
        }`}>
          {scoring && (
            <>
              <Loader2 className="h-4 w-4 animate-spin shrink-0" />
              <div className="flex-1">
                <p className="font-medium">Scoring {scoreProgress.done} of {scoreProgress.total} candidates…</p>
                <div className="mt-1.5 h-1.5 rounded-full bg-violet-200 overflow-hidden">
                  <div
                    className="h-full bg-violet-500 rounded-full transition-all duration-300"
                    style={{ width: scoreProgress.total > 0 ? `${(scoreProgress.done / scoreProgress.total) * 100}%` : '0%' }}
                  />
                </div>
              </div>
            </>
          )}
          {scoreResult && !scoring && (
            <>
              {scoreResult.errors > 0 && scoreResult.scored === 0
                ? <AlertCircle className="h-4 w-4 shrink-0" />
                : <Check className="h-4 w-4 shrink-0" />
              }
              <div className="flex-1">
                <p className="font-medium">
                  {scoreResult.scored > 0 && `✓ ${scoreResult.scored} scored`}
                  {scoreResult.scored > 0 && scoreResult.auto_advanced > 0 && ` · ${scoreResult.auto_advanced} advanced`}
                  {scoreResult.scored > 0 && scoreResult.auto_rejected > 0 && ` · ${scoreResult.auto_rejected} rejected`}
                  {scoreResult.scored > 0 && scoreResult.emails_sent   > 0 && ` · ${scoreResult.emails_sent} emails sent`}
                  {scoreResult.errors > 0 && (scoreResult.scored > 0 ? ` · ` : '') + `${scoreResult.errors} failed`}
                </p>
                {scoreResult.first_error && (
                  <p className="text-xs mt-0.5 opacity-80">{scoreResult.first_error}</p>
                )}
              </div>
              <button onClick={() => setScoreResult(null)} className="p-0.5 rounded hover:bg-emerald-200 transition-colors">
                <X className="h-4 w-4" />
              </button>
            </>
          )}
          {scoreError && (
            <>
              <AlertCircle className="h-4 w-4 shrink-0" />
              <p className="flex-1">{scoreError}</p>
              <button onClick={() => setScoreError('')} className="p-0.5 rounded hover:bg-red-200 transition-colors">
                <X className="h-4 w-4" />
              </button>
            </>
          )}
        </div>
      )}

      {/* Filter / sort bar */}
      <div className="flex items-center gap-2 px-8 py-2.5 border-b border-slate-100 bg-white flex-wrap">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
          <input
            value={filterSearch}
            onChange={e => setFilterSearch(e.target.value)}
            placeholder="Search candidates…"
            className="pl-8 pr-3 py-1.5 text-sm border border-slate-200 rounded-lg w-52 focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white"
          />
        </div>

        <div className="flex items-center gap-1.5 text-slate-500">
          <Filter className="h-3.5 w-3.5" />
          <select
            value={filterSource}
            onChange={e => setFilterSource(e.target.value)}
            className="text-sm border border-slate-200 rounded-lg px-2 py-1.5 text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white"
          >
            <option value="all">All sources</option>
            <option value="applied">Applied</option>
            <option value="sourced">Sourced</option>
            <option value="referral">Referral</option>
            <option value="manual">Added</option>
            <option value="imported">Imported</option>
          </select>
        </div>

        <div className="flex items-center gap-1.5 text-slate-500">
          <ArrowDownUp className="h-3.5 w-3.5" />
          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value as 'date' | 'score' | 'name')}
            className="text-sm border border-slate-200 rounded-lg px-2 py-1.5 text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white"
          >
            <option value="date">Date applied</option>
            <option value="score">AI Score</option>
            <option value="name">Name (A–Z)</option>
          </select>
        </div>

        {(filterSearch || filterSource !== 'all') && (
          <button
            onClick={() => { setFilterSearch(''); setFilterSource('all') }}
            className="text-xs text-slate-500 hover:text-slate-700 underline underline-offset-2"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Ranked view */}
      {viewMode === 'ranked' && (
        <RankedView
          apps={activeApps}
          stages={job.pipeline_stages}
          onCardClick={setSelectedApp}
          onMoveToStage={handleStageChange}
          selectedApps={selectedApps}
          onToggleSelect={toggleSelect}
        />
      )}

      {/* Kanban */}
      {viewMode === 'kanban' && (
      <div className="flex gap-4 items-start overflow-x-auto px-8 py-6 flex-1">
        {job.pipeline_stages.map((stage, stageIndex) => (
          <StageColumn
            key={stage.id}
            stage={stage}
            apps={filteredGrouped[stage.id] ?? []}
            editMode={editMode}
            isMenuOpen={openStageMenu === stage.id}
            onMenuOpen={() => setOpenStageMenu(stage.id)}
            onMenuClose={() => setOpenStageMenu(null)}
            onScoreStage={() => startScoring(stage.id)}
            onMoveAllNext={async () => {
              const nextStage = job.pipeline_stages[stageIndex + 1]
              if (!nextStage) return
              const stageApps = grouped[stage.id] ?? []
              await Promise.all(stageApps.map(app =>
                fetch(`/api/applications/${app.id}`, {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ stage_id: nextStage.id }),
                })
              ))
              load()
            }}
            onDragStart={id => { dragId.current = id }}
            onDrop={handleDrop}
            onCardClick={setSelectedApp}
            onRename={handleRename}
            onRecolor={handleRecolor}
            onDelete={handleDeleteStage}
            selectedApps={selectedApps}
            onToggleSelect={toggleSelect}
            onScheduleInterview={() => {
              const stageApps = grouped[stage.id] ?? []
              const selected = stageApps.filter(a => selectedApps.has(a.id))
              setScheduleModalApps(selected.length > 0 ? selected : stageApps)
            }}
            selectedInStage={(grouped[stage.id] ?? []).filter(a => selectedApps.has(a.id)).length}
          />
        ))}

        {/* Add stage column */}
        {editMode ? (
          <div className="w-[240px] shrink-0">
            <div className="rounded-2xl border-2 border-dashed border-slate-200 p-3">
              <input
                value={newStageName}
                onChange={e => setNewStageName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAddStage()}
                placeholder="Stage name…"
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 mb-2"
              />
              <button
                onClick={handleAddStage}
                disabled={addingStage || !newStageName.trim()}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800 transition-colors disabled:opacity-50"
              >
                {addingStage ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                Add Stage
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setEditMode(true)}
            className="w-[200px] shrink-0 h-20 rounded-2xl border-2 border-dashed border-slate-200 flex items-center justify-center gap-2 text-sm text-slate-400 hover:text-slate-600 hover:border-slate-300 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Add Stage
          </button>
        )}

        {/* Unstaged bucket */}
        {unstaged.length > 0 && (
          <div className="w-[240px] shrink-0">
            <div className="flex items-center justify-between rounded-xl px-4 py-3 bg-slate-50">
              <span className="text-sm font-semibold text-slate-400 italic">Unstaged</span>
              <span className="text-xs font-semibold text-slate-400 bg-white rounded-full px-2 py-0.5 border border-slate-200">
                {unstaged.length}
              </span>
            </div>
            <div className="flex flex-col gap-2 p-2">
              {unstaged.map(app => (
                <CandidateCard
                  key={app.id}
                  app={app}
                  onDragStart={i => { dragId.current = i }}
                  onClick={setSelectedApp}
                  isSelected={selectedApps.has(app.id)}
                  onToggleSelect={toggleSelect}
                />
              ))}
            </div>
          </div>
        )}
      </div>
      )} {/* end viewMode === 'kanban' */}

      {/* Modals & overlays */}
      {showAdd && (
        <AddCandidateModal
          jobId={id}
          stages={job.pipeline_stages}
          onClose={() => setShowAdd(false)}
          onAdded={async () => {
            setShowAdd(false)
            await load()
          }}
        />
      )}

      {selectedApp && (
        <CandidateSlideOver
          app={selectedApp}
          stages={job.pipeline_stages}
          onClose={() => setSelectedApp(null)}
          onStageChange={handleStageChange}
          onStatusChange={handleStatusChange}
        />
      )}

      {showAutopilot && (
        <AutopilotDrawer
          job={job}
          stages={job.pipeline_stages}
          onClose={() => setShowAutopilot(false)}
          onSaved={load}
        />
      )}

      {/* Schedule Interview Modal */}
      {scheduleModalApps && scheduleModalApps.length > 0 && (
        <ScheduleInterviewModal
          apps={scheduleModalApps}
          job={job}
          stages={job.pipeline_stages}
          onClose={() => setScheduleModalApps(null)}
          onScheduled={load}
        />
      )}
    </div>
  )
}
