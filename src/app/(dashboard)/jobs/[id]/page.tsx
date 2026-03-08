'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
  ArrowLeft, Plus, Link2, Users, Pencil, Check, X,
  UserPlus, Search, ChevronDown, MoreHorizontal,
  Loader2, AlertCircle, ExternalLink, ClipboardList, Star, Trash2,
  Zap, Settings2, LayoutList, Kanban,
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
  app,
  onDragStart,
  onClick,
}: {
  app: Application
  onDragStart: (id: string) => void
  onClick: (app: Application) => void
}) {
  const c = app.candidate!
  return (
    <div
      draggable
      onDragStart={() => onDragStart(app.id)}
      onClick={() => onClick(app)}
      className="group cursor-pointer rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm hover:shadow-md hover:border-blue-200 transition-all select-none"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
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

function StageColumn({
  stage,
  apps,
  editMode,
  onDragStart,
  onDrop,
  onCardClick,
  onRename,
  onRecolor,
  onDelete,
}: {
  stage: PipelineStage
  apps: Application[]
  editMode: boolean
  onDragStart: (id: string) => void
  onDrop: (stageId: string) => void
  onCardClick: (app: Application) => void
  onRename: (id: string, name: string) => void
  onRecolor: (id: string, color: StageColor) => void
  onDelete: (id: string) => void
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

  return (
    <div
      className={`flex flex-col w-[240px] shrink-0 rounded-2xl border-2 transition-colors ${
        over ? `${style.border} shadow-md` : 'border-transparent'
      }`}
      onDragOver={e => { e.preventDefault(); setOver(true) }}
      onDragLeave={() => setOver(false)}
      onDrop={() => { setOver(false); onDrop(stage.id) }}
    >
      {/* Column header */}
      <div className={`flex items-center justify-between rounded-xl px-4 py-3 ${style.header}`}>
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
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="text-xs font-semibold text-slate-400 bg-white rounded-full px-2 py-0.5 border border-slate-200">
            {apps.length}
          </span>
          {editMode && !editing && (
            <div className="flex items-center gap-0.5">
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
}: {
  apps: Application[]
  stages: PipelineStage[]
  onCardClick: (app: Application) => void
  onMoveToStage: (appId: string, stageId: string) => void
}) {
  const sorted = [...apps].sort((a, b) => {
    if (a.ai_score === null && b.ai_score === null) return 0
    if (a.ai_score === null) return 1
    if (b.ai_score === null) return -1
    return b.ai_score - a.ai_score
  })

  // The second stage (index 1) is a sensible default move target
  const targetStage = stages[1] ?? stages[0]

  let scoredRank = 0

  return (
    <div className="px-8 py-6 flex-1">
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50/60">
              <th className="text-left text-xs font-semibold text-slate-400 px-4 py-3 w-10">#</th>
              <th className="text-left text-xs font-semibold text-slate-400 px-4 py-3">Candidate</th>
              <th className="text-left text-xs font-semibold text-slate-400 px-4 py-3">Score</th>
              <th className="text-left text-xs font-semibold text-slate-400 px-4 py-3">AI Signal</th>
              <th className="text-left text-xs font-semibold text-slate-400 px-4 py-3">Stage</th>
              <th className="text-left text-xs font-semibold text-slate-400 px-4 py-3">Source</th>
              <th className="text-left text-xs font-semibold text-slate-400 px-4 py-3">Days</th>
              <th className="px-4 py-3 w-10" />
            </tr>
          </thead>
          <tbody>
            {sorted.map(app => {
              const c = app.candidate!
              const stage = stages.find(s => s.id === app.stage_id)
              const rec = app.ai_recommendation ? AI_REC_CONFIG[app.ai_recommendation] : null
              if (app.ai_score !== null) scoredRank++
              const rank = app.ai_score !== null ? scoredRank : null

              return (
                <tr
                  key={app.id}
                  onClick={() => onCardClick(app)}
                  className="border-b border-slate-50 hover:bg-slate-50 cursor-pointer transition-colors last:border-0"
                >
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
                    {targetStage && app.stage_id !== targetStage.id && (
                      <button
                        onClick={() => onMoveToStage(app.id, targetStage.id)}
                        className="flex items-center gap-1 rounded-lg border border-blue-200 px-2 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50 transition-colors whitespace-nowrap"
                      >
                        → {targetStage.name}
                      </button>
                    )}
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
  const dragId = useRef<string | null>(null)

  // View mode
  const [viewMode, setViewMode] = useState<'kanban' | 'ranked'>('kanban')

  // Autopilot drawer
  const [showAutopilot, setShowAutopilot] = useState(false)

  // Scoring state
  const [scoring, setScoring] = useState(false)
  const [scoreProgress, setScoreProgress] = useState<{ done: number; total: number }>({ done: 0, total: 0 })
  const [scoreResult,   setScoreResult]   = useState<{ scored: number; errors: number; first_error: string | null; auto_advanced: number; auto_rejected: number; emails_sent: number } | null>(null)
  const [scoreError,    setScoreError]    = useState('')

  const load = useCallback(async () => {
    const res = await fetch(`/api/jobs/${id}`)
    const json = await res.json()
    setJob(json.data ?? null)
    setLoading(false)
  }, [id])

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

  const startScoring = async () => {
    if (scoring) return
    const total = activeApps.length
    if (total === 0) return

    setScoring(true)
    setScoreError('')
    setScoreResult(null)
    setScoreProgress({ done: 0, total })

    try {
      const res = await fetch(`/api/jobs/${id}/score`, { method: 'POST' })
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
            } else if (evt.type === 'complete') {
              setScoreResult({
                scored:        (evt.scored        as number) ?? 0,
                errors:        (evt.errors        as number) ?? 0,
                first_error:   (evt.first_error   as string | null) ?? null,
                auto_advanced: (evt.auto_advanced as number) ?? 0,
                auto_rejected: (evt.auto_rejected as number) ?? 0,
                emails_sent:   (evt.emails_sent   as number) ?? 0,
              })
              await load()
            }
          } catch { /* ignore malformed frames */ }
        }
      }
    } catch (err) {
      setScoreError(err instanceof Error ? err.message : 'Scoring failed')
    } finally {
      setScoring(false)
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

        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="flex items-center rounded-xl border border-slate-200 p-0.5 bg-slate-50">
            <button
              onClick={() => setViewMode('kanban')}
              className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
                viewMode === 'kanban' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <Kanban className="h-3.5 w-3.5" />
              Kanban
            </button>
            <button
              onClick={() => setViewMode('ranked')}
              className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
                viewMode === 'ranked' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <LayoutList className="h-3.5 w-3.5" />
              Ranked
            </button>
          </div>

          <div className="h-5 w-px bg-slate-200" />

          {/* Autopilot */}
          <button
            onClick={() => setShowAutopilot(true)}
            className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium transition-colors border ${
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

          {/* Score All */}
          <button
            onClick={startScoring}
            disabled={scoring || activeApps.length === 0}
            className="flex items-center gap-2 rounded-xl bg-violet-600 px-3 py-2 text-sm font-semibold text-white hover:bg-violet-700 transition-colors disabled:opacity-60 shadow-sm"
          >
            {scoring
              ? <><Loader2 className="h-4 w-4 animate-spin" /> Scoring {scoreProgress.done}/{scoreProgress.total}</>
              : <><Zap className="h-4 w-4" /> Score All</>
            }
          </button>

          <button
            onClick={() => setEditMode(e => !e)}
            className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition-colors ${
              editMode
                ? 'bg-blue-600 text-white hover:bg-blue-700'
                : 'border border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            {editMode ? <><Check className="h-4 w-4" /> Done</> : <><Pencil className="h-4 w-4" /> Edit Stages</>}
          </button>
          <button
            onClick={copyApplyLink}
            className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
          >
            {copied ? <><Check className="h-4 w-4 text-emerald-500" /> Copied!</> : <><Link2 className="h-4 w-4" /> Apply Link</>}
          </button>
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

      {/* Ranked view */}
      {viewMode === 'ranked' && (
        <RankedView
          apps={activeApps}
          stages={job.pipeline_stages}
          onCardClick={setSelectedApp}
          onMoveToStage={handleStageChange}
        />
      )}

      {/* Kanban */}
      {viewMode === 'kanban' && (
      <div className="flex gap-4 items-start overflow-x-auto px-8 py-6 flex-1">
        {job.pipeline_stages.map(stage => (
          <StageColumn
            key={stage.id}
            stage={stage}
            apps={grouped[stage.id] ?? []}
            editMode={editMode}
            onDragStart={id => { dragId.current = id }}
            onDrop={handleDrop}
            onCardClick={setSelectedApp}
            onRename={handleRename}
            onRecolor={handleRecolor}
            onDelete={handleDeleteStage}
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
    </div>
  )
}
