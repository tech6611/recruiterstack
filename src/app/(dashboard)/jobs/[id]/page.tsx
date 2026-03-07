'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
  ArrowLeft, Plus, Link2, Users, Pencil, Check, X,
  UserPlus, Search, ChevronDown, MoreHorizontal,
  Loader2, AlertCircle, ExternalLink,
} from 'lucide-react'
import type { JobWithPipeline, PipelineStage, Application, Candidate, StageColor } from '@/lib/types/database'

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
        <span className="text-xs text-slate-400">{daysSince(app.applied_at)}d</span>
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
  onAdded: (app: Application) => void
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
    onAdded(json.data)
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
    onAdded(json.data)
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
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

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

  return (
    <div className="fixed inset-0 z-40 flex">
      <div className="flex-1" onClick={onClose} />
      <div className="w-[400px] bg-white border-l border-slate-200 shadow-2xl flex flex-col h-full overflow-y-auto">
        {/* Header */}
        <div className="flex items-start justify-between px-6 py-5 border-b border-slate-200 sticky top-0 bg-white z-10">
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

        {/* Body */}
        <div className="flex-1 px-6 py-5 space-y-5">
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

        {/* Footer */}
        <div className="border-t border-slate-200 px-6 py-4 sticky bottom-0 bg-white">
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

  const load = useCallback(async () => {
    const res = await fetch(`/api/jobs/${id}`)
    const json = await res.json()
    setJob(json.data ?? null)
    setLoading(false)
  }, [id])

  useEffect(() => { load() }, [load])

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

      {/* Kanban */}
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

      {/* Modals & overlays */}
      {showAdd && (
        <AddCandidateModal
          jobId={id}
          stages={job.pipeline_stages}
          onClose={() => setShowAdd(false)}
          onAdded={app => {
            setJob(prev => prev ? { ...prev, applications: [...prev.applications, app] } : prev)
            setShowAdd(false)
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
    </div>
  )
}
