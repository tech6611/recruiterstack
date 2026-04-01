'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useAuth } from '@clerk/nextjs'
import { useRouter } from 'next/navigation'
import {
  Plus, Search, X, Users, Loader2, Download,
  UserCheck, UserMinus, MessageSquare, FileCheck, CheckCircle, XCircle,
  ChevronUp, ChevronDown, ChevronsUpDown, ChevronLeft, ChevronRight,
  GripVertical, Pencil,
} from 'lucide-react'
import type { CandidateStatus, CandidateListItem } from '@/lib/types/database'
import { inputCls, labelCls } from '@/lib/ui/styles'

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<CandidateStatus, { label: string; color: string; icon: React.ReactNode }> = {
  active:         { label: 'Active',         color: 'bg-blue-50 text-blue-700 border-blue-200',          icon: <UserCheck className="h-3 w-3" /> },
  inactive:       { label: 'Inactive',       color: 'bg-slate-100 text-slate-600 border-slate-200',      icon: <UserMinus className="h-3 w-3" /> },
  interviewing:   { label: 'Interviewing',   color: 'bg-amber-50 text-amber-700 border-amber-200',       icon: <MessageSquare className="h-3 w-3" /> },
  offer_extended: { label: 'Offer Extended', color: 'bg-violet-50 text-violet-700 border-violet-200',    icon: <FileCheck className="h-3 w-3" /> },
  hired:          { label: 'Hired',          color: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: <CheckCircle className="h-3 w-3" /> },
  rejected:       { label: 'Rejected',       color: 'bg-red-50 text-red-700 border-red-200',             icon: <XCircle className="h-3 w-3" /> },
}

// ─────────────────────────────────────────────────────────────────────────────
// Pipeline Funnel — stage definitions + count aggregation (by candidate status)
// ─────────────────────────────────────────────────────────────────────────────

interface FunnelStageDef {
  id:     string
  name:   string
  accent: {
    border: string   // border-t-* colour class
    dot:    string   // bg-* for dot
    badge:  string   // bg + text for count chip
  }
}

const ALL_FUNNEL_DEFS: FunnelStageDef[] = [
  { id: 'sourced',        name: 'Sourced',          accent: { border: 'border-t-slate-400',   dot: 'bg-slate-400',   badge: 'bg-slate-100 text-slate-600' } },
  { id: 'screened',       name: 'Screened',         accent: { border: 'border-t-blue-400',    dot: 'bg-blue-500',    badge: 'bg-blue-100 text-blue-700' } },
  { id: 'engaged',        name: 'Engaged',          accent: { border: 'border-t-violet-400',  dot: 'bg-violet-500',  badge: 'bg-violet-100 text-violet-700' } },
  { id: 'interview',      name: 'Interview',        accent: { border: 'border-t-amber-400',   dot: 'bg-amber-500',   badge: 'bg-amber-100 text-amber-700' } },
  { id: 'offer_accepted', name: 'Offer Accepted',   accent: { border: 'border-t-green-500',   dot: 'bg-green-500',   badge: 'bg-green-100 text-green-700' } },
  { id: 'offer_out',      name: 'Offer Rolled Out', accent: { border: 'border-t-emerald-500', dot: 'bg-emerald-500', badge: 'bg-emerald-100 text-emerald-700' } },
  { id: 'hired',          name: 'Hired',            accent: { border: 'border-t-teal-500',    dot: 'bg-teal-500',    badge: 'bg-teal-100 text-teal-700' } },
  { id: 'onboarded',      name: 'Onboarded',        accent: { border: 'border-t-indigo-500',  dot: 'bg-indigo-500',  badge: 'bg-indigo-100 text-indigo-700' } },
]

const LS_FUNNEL          = 'rs_candidates_funnel'
const DEFAULT_FUNNEL_IDS = ALL_FUNNEL_DEFS.map(d => d.id)

// Map CandidateStatus → funnel stage IDs
function computeFunnelCounts(candidates: CandidateListItem[]): Map<string, number> {
  const counts = new Map<string, number>()
  ALL_FUNNEL_DEFS.forEach(d => counts.set(d.id, 0))
  for (const c of candidates) {
    switch (c.status) {
      case 'active':
      case 'inactive':
        counts.set('sourced', (counts.get('sourced') ?? 0) + 1); break
      case 'interviewing':
        counts.set('interview', (counts.get('interview') ?? 0) + 1); break
      case 'offer_extended':
        counts.set('offer_out', (counts.get('offer_out') ?? 0) + 1); break
      case 'hired':
        counts.set('hired', (counts.get('hired') ?? 0) + 1); break
    }
  }
  return counts
}

// ─────────────────────────────────────────────────────────────────────────────
// FunnelCustomizer — inline drag-to-reorder panel
// ─────────────────────────────────────────────────────────────────────────────

function FunnelCustomizer({
  activeIds, snapshot, onClose, onDiscard, onChange,
}: {
  activeIds: string[]
  snapshot:  string[]
  onClose:   () => void
  onDiscard: () => void
  onChange:  (ids: string[]) => void
}) {
  const [draggingId,  setDraggingId]  = useState<string | null>(null)
  const [dragOverId,  setDragOverId]  = useState<string | null>(null)
  const [showDiscard, setShowDiscard] = useState(false)

  const hasChanges = JSON.stringify(activeIds) !== JSON.stringify(snapshot)
  const available  = ALL_FUNNEL_DEFS.filter(d => !activeIds.includes(d.id))

  function handleDragStart(id: string) { setDraggingId(id) }
  function handleDragOver(e: React.DragEvent, id: string) { e.preventDefault(); setDragOverId(id) }
  function handleDrop(targetId: string) {
    if (!draggingId || draggingId === targetId) { setDraggingId(null); setDragOverId(null); return }
    const from = activeIds.indexOf(draggingId)
    const to   = activeIds.indexOf(targetId)
    const next = [...activeIds]
    next.splice(from, 1)
    next.splice(to, 0, draggingId)
    onChange(next)
    setDraggingId(null); setDragOverId(null)
  }
  function handleDragEnd() { setDraggingId(null); setDragOverId(null) }

  return (
    <div className="border-b border-slate-100 bg-violet-50/40 px-4 py-4">
      {/* Header */}
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs font-semibold text-slate-800">Customise funnel</p>
        <div className="flex items-center gap-1.5">
          {hasChanges && (
            <button onClick={() => setShowDiscard(true)}
              className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-500 hover:text-red-500 transition-colors">
              Discard
            </button>
          )}
          <button
            onClick={() => { if (hasChanges) setShowDiscard(true); else onClose() }}
            className="rounded-lg bg-violet-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-violet-700 transition-colors">
            Done
          </button>
        </div>
      </div>

      <p className="mb-3 text-[10px] text-slate-400">Drag to reorder · click × to remove</p>

      {/* Discard dialog */}
      {showDiscard && (
        <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
          <p className="text-xs font-semibold text-slate-800">Save changes?</p>
          <div className="mt-2 flex gap-1.5">
            <button onClick={() => setShowDiscard(false)}
              className="flex-1 rounded-lg border border-slate-200 bg-white py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50 transition-colors">
              Keep editing
            </button>
            <button onClick={onDiscard}
              className="flex-1 rounded-lg border border-red-200 bg-white py-1 text-[11px] font-medium text-red-600 hover:bg-red-50 transition-colors">
              Discard
            </button>
            <button onClick={onClose}
              className="flex-1 rounded-lg bg-violet-600 py-1 text-[11px] font-medium text-white hover:bg-violet-700 transition-colors">
              Save
            </button>
          </div>
        </div>
      )}

      {/* Active stages */}
      <div className="mb-4">
        <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">Active stages</p>
        <div className="flex flex-wrap gap-1.5">
          {activeIds.map(id => {
            const def = ALL_FUNNEL_DEFS.find(d => d.id === id)
            if (!def) return null
            const isDragging = draggingId === id
            const isDragOver = dragOverId === id && draggingId !== id
            return (
              <div
                key={id}
                draggable
                onDragStart={() => handleDragStart(id)}
                onDragOver={e => handleDragOver(e, id)}
                onDrop={() => handleDrop(id)}
                onDragEnd={handleDragEnd}
                className={`flex items-center gap-1.5 rounded-lg border bg-white px-2.5 py-1.5 cursor-grab active:cursor-grabbing select-none transition-all ${
                  isDragging ? 'opacity-40 scale-95 border-violet-300' :
                  isDragOver ? 'border-violet-400 shadow-sm ring-1 ring-violet-300 -translate-y-0.5' :
                  'border-slate-200 hover:border-slate-300'
                }`}
              >
                <GripVertical className="h-3 w-3 text-slate-300" />
                <span className={`h-2 w-2 shrink-0 rounded-full ${def.accent.dot}`} />
                <span className="text-xs font-medium text-slate-700">{def.name}</span>
                <button
                  onClick={() => onChange(activeIds.filter(x => x !== id))}
                  className="ml-0.5 text-slate-300 hover:text-red-500 transition-colors">
                  <X className="h-3 w-3" />
                </button>
              </div>
            )
          })}
          {activeIds.length === 0 && (
            <p className="py-2 text-xs text-slate-400">No active stages. Add some below.</p>
          )}
        </div>
      </div>

      {/* Available stages to add */}
      {available.length > 0 && (
        <div>
          <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">Add stages</p>
          <div className="flex flex-wrap gap-1.5">
            {available.map(def => (
              <button
                key={def.id}
                onClick={() => onChange([...activeIds, def.id])}
                className="flex items-center gap-1.5 rounded-lg border border-dashed border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-500 hover:border-violet-400 hover:bg-violet-50 hover:text-violet-600 transition-colors"
              >
                <Plus className="h-3 w-3" />
                {def.name}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// PipelineFunnel — horizontal stage cards with arrows
// ─────────────────────────────────────────────────────────────────────────────

function PipelineFunnel({ candidates }: { candidates: CandidateListItem[] }) {
  const [stageIds,    setStageIds]    = useState<string[]>(DEFAULT_FUNNEL_IDS)
  const [customizing, setCustomizing] = useState(false)
  const [snapshot,    setSnapshot]    = useState<string[]>([])
  const [hydrated,    setHydrated]    = useState(false)

  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dragOverId, setDragOverId] = useState<string | null>(null)

  // Hydrate from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(LS_FUNNEL)
      if (saved) {
        const parsed = JSON.parse(saved) as string[]
        const validIds = new Set(ALL_FUNNEL_DEFS.map(d => d.id))
        const valid = parsed.filter(id => validIds.has(id))
        if (valid.length > 0) setStageIds(valid)
      }
    } catch {}
    setHydrated(true)
  }, [])

  useEffect(() => {
    if (!hydrated) return
    try { localStorage.setItem(LS_FUNNEL, JSON.stringify(stageIds)) } catch {}
  }, [stageIds, hydrated])

  const counts = useMemo(() => computeFunnelCounts(candidates), [candidates])

  function openCustomizer() { setSnapshot(stageIds); setCustomizing(true) }

  function handleDragStart(id: string) { setDraggingId(id) }
  function handleDragOver(e: React.DragEvent, id: string) { e.preventDefault(); setDragOverId(id) }
  function handleDrop(targetId: string) {
    if (!draggingId || draggingId === targetId) { setDraggingId(null); setDragOverId(null); return }
    const from = stageIds.indexOf(draggingId)
    const to   = stageIds.indexOf(targetId)
    const next = [...stageIds]
    next.splice(from, 1)
    next.splice(to, 0, draggingId)
    setStageIds(next)
    setDraggingId(null); setDragOverId(null)
  }
  function handleDragEnd() { setDraggingId(null); setDragOverId(null) }

  if (!hydrated) return null

  const activeDefs = stageIds
    .map(id => ALL_FUNNEL_DEFS.find(d => d.id === id))
    .filter((d): d is FunnelStageDef => !!d)

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">

      {/* Header row */}
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5">
        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Hiring Funnel</span>
        <button
          onClick={customizing ? undefined : openCustomizer}
          title="Customise funnel"
          className={`flex items-center justify-center rounded-lg border p-1.5 transition-colors ${
            customizing
              ? 'border-violet-300 bg-violet-50 text-violet-600 cursor-default'
              : 'border-slate-200 text-slate-400 hover:bg-slate-50 hover:text-slate-700'
          }`}
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Customizer */}
      {customizing && (
        <FunnelCustomizer
          activeIds={stageIds}
          snapshot={snapshot}
          onClose={() => setCustomizing(false)}
          onDiscard={() => { setStageIds(snapshot); setCustomizing(false) }}
          onChange={setStageIds}
        />
      )}

      {/* Funnel cards */}
      {!customizing && (
        <div className="flex items-stretch overflow-x-auto px-4 py-4 gap-0">
          {activeDefs.map((def, idx) => {
            const count      = counts.get(def.id) ?? 0
            const isLast     = idx === activeDefs.length - 1
            const isDragging = draggingId === def.id
            const isDragOver = dragOverId === def.id && draggingId !== def.id

            return (
              <div key={def.id} className="flex items-center shrink-0">
                {/* Stage card */}
                <div
                  draggable
                  onDragStart={() => handleDragStart(def.id)}
                  onDragOver={e => handleDragOver(e, def.id)}
                  onDrop={() => handleDrop(def.id)}
                  onDragEnd={handleDragEnd}
                  className={`flex flex-col rounded-xl border border-t-2 bg-white px-4 py-3 min-w-[130px] select-none cursor-grab active:cursor-grabbing transition-all ${
                    def.accent.border
                  } ${
                    isDragging  ? 'opacity-40 scale-95 shadow-none' :
                    isDragOver  ? 'shadow-md ring-1 ring-violet-300 -translate-y-1' :
                    'shadow-sm hover:shadow-md hover:-translate-y-0.5'
                  }`}
                >
                  <div className="flex items-center gap-1.5 mb-2">
                    <span className={`h-2 w-2 shrink-0 rounded-full ${def.accent.dot}`} />
                    <span className="text-[11px] font-semibold text-slate-600 truncate leading-tight">{def.name}</span>
                  </div>
                  <p className="text-2xl font-bold text-slate-800 leading-none">{count}</p>
                  <p className="text-[10px] text-slate-400 mt-1">candidates</p>
                </div>

                {/* Arrow connector */}
                {!isLast && (
                  <div className="flex items-center px-1 text-slate-300 shrink-0">
                    <ChevronRight className="h-5 w-5" />
                  </div>
                )}
              </div>
            )
          })}

          {activeDefs.length === 0 && (
            <div className="flex-1 py-8 text-center text-xs text-slate-400">
              No stages in the funnel.{' '}
              <button onClick={openCustomizer} className="text-violet-500 hover:underline">Add some</button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

type SortKey = 'name' | 'current_title' | 'status' | 'created_at'

const PAGE_SIZE = 30


const BLANK_FORM = {
  name: '', email: '', phone: '',
  current_title: '', location: '',
  linkedin_url: '', experience_years: 0,
  skills: [] as string[],
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export default function CandidatesPage() {
  const router = useRouter()
  const { orgId } = useAuth()

  // ── List state ─────────────────────────────────────────────────────────────
  const [candidates, setCandidates] = useState<CandidateListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState<CandidateStatus | 'all'>('all')
  const [sortKey, setSortKey] = useState<SortKey>('created_at')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [page, setPage] = useState(1)

  // ── Drawer state ───────────────────────────────────────────────────────────
  const [showDrawer, setShowDrawer] = useState(false)
  const [form, setForm] = useState({ ...BLANK_FORM })
  const [skillInput, setSkillInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  // ── Data fetching ──────────────────────────────────────────────────────────
  const fetchCandidates = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/candidates')
    if (res.ok) {
      const json = await res.json()
      setCandidates((json.data ?? []) as CandidateListItem[])
    }
    setLoading(false)
  }, [])

  useEffect(() => { if (orgId) fetchCandidates() }, [fetchCandidates, orgId])

  // ── Sorting ────────────────────────────────────────────────────────────────
  const toggleSort = (key: SortKey) => {
    setPage(1)
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <ChevronsUpDown className="h-3 w-3 text-slate-300 ml-1" />
    return sortDir === 'asc'
      ? <ChevronUp className="h-3 w-3 text-blue-500 ml-1" />
      : <ChevronDown className="h-3 w-3 text-blue-500 ml-1" />
  }

  // ── Derived ────────────────────────────────────────────────────────────────
  const counts = useMemo(() => ({
    total:        candidates.length,
    active:       candidates.filter(c => c.status === 'active').length,
    interviewing: candidates.filter(c => c.status === 'interviewing').length,
    hired:        candidates.filter(c => c.status === 'hired').length,
  }), [candidates])

  const filtered = useMemo(() => {
    let result = [...candidates]
    if (filterStatus !== 'all') result = result.filter(c => c.status === filterStatus)
    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter(c =>
        c.name.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q) ||
        (c.current_title ?? '').toLowerCase().includes(q) ||
        (c.location ?? '').toLowerCase().includes(q)
      )
    }
    result.sort((a, b) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const vA = String((a as any)[sortKey] ?? '')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const vB = String((b as any)[sortKey] ?? '')
      const cmp = vA.localeCompare(vB, undefined, { numeric: true })
      return sortDir === 'asc' ? cmp : -cmp
    })
    return result
  }, [candidates, filterStatus, search, sortKey, sortDir])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const paginated = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE
    return filtered.slice(start, start + PAGE_SIZE)
  }, [filtered, page])

  // ── Drawer helpers ─────────────────────────────────────────────────────────
  const closeDrawer = () => {
    setShowDrawer(false)
    setForm({ ...BLANK_FORM })
    setSkillInput('')
    setSaveError(null)
  }

  const addSkill = () => {
    const skill = skillInput.trim().replace(/,$/, '')
    if (skill && !form.skills.includes(skill)) {
      setForm(f => ({ ...f, skills: [...f.skills, skill] }))
    }
    setSkillInput('')
  }

  const normalizeUrl = (url: string) => {
    const trimmed = url.trim()
    if (!trimmed) return null
    return trimmed.startsWith('http') ? trimmed : `https://${trimmed}`
  }

  const handleAddCandidate = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setSaveError(null)

    const payload = {
      name:             form.name.trim(),
      email:            form.email.trim().toLowerCase(),
      phone:            form.phone.trim() || null,
      current_title:    form.current_title.trim() || null,
      location:         form.location.trim() || null,
      linkedin_url:     normalizeUrl(form.linkedin_url),
      experience_years: Number(form.experience_years),
      skills:           form.skills,
      status:           'active' as CandidateStatus,
    }

    const res = await fetch('/api/candidates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    setSaving(false)

    if (!res.ok) {
      const json = await res.json()
      setSaveError(
        res.status === 409
          ? 'A candidate with this email already exists.'
          : (json.error ?? 'Something went wrong')
      )
      return
    }

    closeDrawer()
    fetchCandidates()
  }

  const thCls = 'px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide select-none cursor-pointer hover:text-slate-800 transition-colors'

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="p-8 max-w-6xl space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Candidates</h1>
          <p className="text-sm text-slate-500 mt-0.5">Your talent pool across all roles</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              const params = new URLSearchParams()
              if (filterStatus !== 'all') params.set('status', filterStatus)
              if (search.trim()) params.set('search', search.trim())
              const qs = params.toString()
              window.location.href = `/api/export/candidates${qs ? `?${qs}` : ''}`
            }}
            className="flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
          >
            <Download className="h-4 w-4" />
            Export CSV
          </button>
          <button
            onClick={() => setShowDrawer(true)}
            className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 transition-colors shadow-sm"
          >
            <Plus className="h-4 w-4" />
            Add Candidate
          </button>
        </div>
      </div>

      {/* Stat cards */}
      {loading ? (
        <div className="grid grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-slate-200 bg-white p-3.5 animate-pulse">
              <div className="h-7 w-10 rounded bg-slate-200 mb-2" />
              <div className="h-3 w-16 rounded bg-slate-100" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-4 gap-3">
          {([
            { label: 'Total',        value: counts.total,        color: 'bg-slate-50 border-slate-200 text-slate-700',       filter: 'all'          },
            { label: 'Active',       value: counts.active,       color: 'bg-blue-50 border-blue-200 text-blue-700',          filter: 'active'       },
            { label: 'Interviewing', value: counts.interviewing, color: 'bg-amber-50 border-amber-200 text-amber-700',       filter: 'interviewing' },
            { label: 'Hired',        value: counts.hired,        color: 'bg-emerald-50 border-emerald-200 text-emerald-700', filter: 'hired'        },
          ] as const).map(stat => (
            <button
              key={stat.label}
              onClick={() => { setFilterStatus(filterStatus === stat.filter ? 'all' : stat.filter); setPage(1) }}
              className={`rounded-xl border p-3.5 text-left transition-all hover:shadow-sm ${stat.color} ${
                filterStatus === stat.filter ? 'ring-2 ring-offset-1 ring-blue-400' : ''
              }`}
            >
              <p className="text-2xl font-bold">{stat.value}</p>
              <p className="text-xs font-medium mt-0.5 opacity-70">{stat.label}</p>
            </button>
          ))}
        </div>
      )}

      {/* Hiring Funnel */}
      <PipelineFunnel candidates={candidates} />

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
          <input
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1) }}
            placeholder="Search name, email, title…"
            className="w-full pl-8 pr-3 py-2 rounded-xl border border-slate-200 bg-white text-sm text-slate-700 placeholder-slate-400 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2">
              <X className="h-3.5 w-3.5 text-slate-400 hover:text-slate-600" />
            </button>
          )}
        </div>
        <select
          value={filterStatus}
          onChange={e => { setFilterStatus(e.target.value as CandidateStatus | 'all'); setPage(1) }}
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition"
        >
          <option value="all">All statuses</option>
          {(Object.keys(STATUS_CONFIG) as CandidateStatus[]).map(s => (
            <option key={s} value={s}>{STATUS_CONFIG[s].label}</option>
          ))}
        </select>
        {(filterStatus !== 'all' || search) && (
          <button
            onClick={() => { setFilterStatus('all'); setSearch(''); setPage(1) }}
            className="text-xs text-slate-500 hover:text-slate-800 transition-colors"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Table */}
      {loading ? (
        <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                {['w-10', 'w-40', 'w-36', 'w-24', 'w-28', 'w-24'].map((w, i) => (
                  <th key={i} className="px-4 py-3">
                    <div className={`h-3 ${w} rounded bg-slate-200 animate-pulse`} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 8 }).map((_, i) => (
                <tr key={i} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-4"><div className="h-3 w-4 rounded bg-slate-100 animate-pulse" /></td>
                  <td className="px-4 py-4">
                    <div className="h-3.5 w-32 rounded bg-slate-200 animate-pulse mb-2" />
                    <div className="h-2.5 w-24 rounded bg-slate-100 animate-pulse" />
                  </td>
                  <td className="px-4 py-4"><div className="h-3 w-28 rounded bg-slate-100 animate-pulse" /></td>
                  <td className="px-4 py-4"><div className="h-5 w-14 rounded-full bg-slate-100 animate-pulse" /></td>
                  <td className="px-4 py-4"><div className="h-5 w-20 rounded-full bg-slate-100 animate-pulse" /></td>
                  <td className="px-4 py-4"><div className="h-3 w-20 rounded bg-slate-100 animate-pulse" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : candidates.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 py-16 text-center">
          <Users className="h-10 w-10 text-slate-200 mx-auto mb-3" />
          <p className="text-sm font-medium text-slate-500">No candidates yet</p>
          <p className="text-xs text-slate-400 mt-1 mb-4">Add your first candidate to start building your talent pool</p>
          <button
            onClick={() => setShowDrawer(true)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Candidate
          </button>
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide w-10">#</th>
                <th className={thCls} onClick={() => toggleSort('name')}>
                  <span className="flex items-center">Name <SortIcon col="name" /></span>
                </th>
                <th className={thCls} onClick={() => toggleSort('current_title')}>
                  <span className="flex items-center">Current Title <SortIcon col="current_title" /></span>
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide cursor-default">
                  Active Jobs
                </th>
                <th className={thCls} onClick={() => toggleSort('status')}>
                  <span className="flex items-center">Status <SortIcon col="status" /></span>
                </th>
                <th className={thCls} onClick={() => toggleSort('created_at')}>
                  <span className="flex items-center">Added <SortIcon col="created_at" /></span>
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-10 text-center text-sm text-slate-400">
                    No results match your filters.
                  </td>
                </tr>
              ) : paginated.map((c, idx) => {
                const s = STATUS_CONFIG[c.status]
                return (
                  <tr
                    key={c.id}
                    onClick={() => router.push(`/candidates/${c.id}`)}
                    className="border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors cursor-pointer"
                  >
                    {/* Row number */}
                    <td className="px-4 py-3.5 text-xs text-slate-400 font-medium tabular-nums">
                      {(page - 1) * PAGE_SIZE + idx + 1}
                    </td>
                    {/* Name + email */}
                    <td className="px-4 py-3.5">
                      <p className="font-semibold text-sm text-slate-900">{c.name}</p>
                      <p className="text-xs text-slate-400 mt-0.5">{c.email}</p>
                    </td>
                    {/* Current title */}
                    <td className="px-4 py-3.5 text-sm text-slate-600">
                      {c.current_title ?? <span className="text-slate-300">—</span>}
                    </td>
                    {/* Active jobs badge */}
                    <td className="px-4 py-3.5">
                      {c.active_applications_count > 0 ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600">
                          <Users className="h-3 w-3" />
                          {c.active_applications_count} job{c.active_applications_count !== 1 ? 's' : ''}
                        </span>
                      ) : (
                        <span className="text-slate-300 text-sm">—</span>
                      )}
                    </td>
                    {/* Status badge */}
                    <td className="px-4 py-3.5">
                      <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${s.color}`}>
                        {s.icon}{s.label}
                      </span>
                    </td>
                    {/* Added date */}
                    <td className="px-4 py-3.5 text-xs text-slate-400">
                      {new Date(c.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {filtered.length > 0 && (
            <div className="px-4 py-2.5 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
              <p className="text-xs text-slate-400">
                {filtered.length < candidates.length
                  ? `${filtered.length} match${filtered.length !== 1 ? 'es' : ''} · ${candidates.length} total`
                  : `${candidates.length} candidate${candidates.length !== 1 ? 's' : ''}`}
              </p>
              {totalPages > 1 && (
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronLeft className="h-3 w-3" /> Prev
                  </button>
                  <span className="text-xs text-slate-400 tabular-nums">{page} / {totalPages}</span>
                  <button
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    Next <ChevronRight className="h-3 w-3" />
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Add Candidate Drawer ─────────────────────────────────────────── */}
      {showDrawer && (
        <div className="fixed inset-0 z-50 flex">
          {/* Backdrop */}
          <div className="flex-1 bg-black/30 backdrop-blur-sm" onClick={closeDrawer} />
          {/* Panel */}
          <div className="w-full max-w-lg bg-white border-l border-slate-200 shadow-2xl flex flex-col h-full">
            {/* Sticky header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 shrink-0">
              <span className="text-sm font-semibold text-slate-500">Add Candidate</span>
              <button
                onClick={closeDrawer}
                className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Scrollable form body */}
            <div className="flex-1 overflow-y-auto p-6">
              <form onSubmit={handleAddCandidate} className="space-y-5">

                {saveError && (
                  <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                    {saveError}
                  </div>
                )}

                {/* Basic info */}
                <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Basic Info</p>
                  <div>
                    <label className={labelCls}>Full Name <span className="text-red-500">*</span></label>
                    <input
                      required
                      value={form.name}
                      onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                      placeholder="Alex Rivera"
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label className={labelCls}>Email <span className="text-red-500">*</span></label>
                    <input
                      required
                      type="email"
                      value={form.email}
                      onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                      placeholder="alex@example.com"
                      className={inputCls}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className={labelCls}>Phone</label>
                      <input
                        value={form.phone}
                        onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                        placeholder="+1-555-0101"
                        className={inputCls}
                      />
                    </div>
                    <div>
                      <label className={labelCls}>Experience (yrs)</label>
                      <input
                        type="number" min={0} max={50}
                        value={form.experience_years}
                        onChange={e => setForm(f => ({ ...f, experience_years: Number(e.target.value) }))}
                        className={inputCls}
                      />
                    </div>
                  </div>
                </div>

                {/* Role & Location */}
                <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Role & Location</p>
                  <div>
                    <label className={labelCls}>Current Title</label>
                    <input
                      value={form.current_title}
                      onChange={e => setForm(f => ({ ...f, current_title: e.target.value }))}
                      placeholder="Senior Software Engineer"
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label className={labelCls}>Location</label>
                    <input
                      value={form.location}
                      onChange={e => setForm(f => ({ ...f, location: e.target.value }))}
                      placeholder="New York, Remote…"
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label className={labelCls}>LinkedIn URL</label>
                    <input
                      value={form.linkedin_url}
                      onChange={e => setForm(f => ({ ...f, linkedin_url: e.target.value }))}
                      placeholder="linkedin.com/in/alexrivera"
                      className={inputCls}
                    />
                  </div>
                </div>

                {/* Skills */}
                <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-3">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Skills</p>
                  <div className="flex flex-wrap gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 min-h-[44px] focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100 transition">
                    {form.skills.map(skill => (
                      <span key={skill} className="flex items-center gap-1 rounded-lg bg-white border border-slate-200 px-2 py-0.5 text-xs font-medium text-slate-700 shadow-sm">
                        {skill}
                        <button
                          type="button"
                          onClick={() => setForm(f => ({ ...f, skills: f.skills.filter(s => s !== skill) }))}
                          className="text-slate-300 hover:text-red-500 transition-colors"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                    <input
                      value={skillInput}
                      onChange={e => setSkillInput(e.target.value)}
                      onKeyDown={e => {
                        if ((e.key === 'Enter' || e.key === ',') && skillInput.trim()) {
                          e.preventDefault()
                          addSkill()
                        }
                        if (e.key === 'Backspace' && !skillInput && form.skills.length > 0) {
                          setForm(f => ({ ...f, skills: f.skills.slice(0, -1) }))
                        }
                      }}
                      onBlur={() => { if (skillInput.trim()) addSkill() }}
                      placeholder={form.skills.length === 0 ? 'Type skill and press Enter…' : ''}
                      className="flex-1 min-w-[130px] bg-transparent text-sm text-slate-700 outline-none placeholder-slate-400 py-0.5"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={saving}
                  className="w-full flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60 transition-colors shadow-sm"
                >
                  {saving ? <><Loader2 className="h-4 w-4 animate-spin" />Saving…</> : 'Add Candidate'}
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
