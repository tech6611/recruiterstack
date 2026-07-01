'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useAuth } from '@clerk/nextjs'
import { useRouter } from 'next/navigation'
import {
  Plus, Search, X, Users, Loader2, Download, Clock,
  UserCheck, UserMinus, MessageSquare, FileCheck, CheckCircle, XCircle,
  ChevronUp, ChevronDown, ChevronsUpDown, ChevronLeft, ChevronRight,
  GripVertical, Pencil, CalendarDays, Check,
} from 'lucide-react'
import type { CandidateStatus, CandidateListItem } from '@/lib/types/database'
import { inputCls, labelCls } from '@/lib/ui/styles'
import { trackEvent } from '@/lib/analytics'

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<CandidateStatus, { label: string; color: string; icon: React.ReactNode }> = {
  active:         { label: 'Active',         color: 'bg-slate-50 text-slate-700 border-slate-200',          icon: <UserCheck className="h-3 w-3" /> },
  on_hold:        { label: 'On Hold',        color: 'bg-orange-50 text-orange-700 border-orange-200',    icon: <Clock className="h-3 w-3" /> },
  inactive:       { label: 'Inactive',       color: 'bg-slate-100 text-slate-600 border-slate-200',      icon: <UserMinus className="h-3 w-3" /> },
  interviewing:   { label: 'Interviewing',   color: 'bg-amber-50 text-amber-700 border-amber-200',       icon: <MessageSquare className="h-3 w-3" /> },
  offer_extended: { label: 'Offer Extended', color: 'bg-slate-50 text-slate-700 border-slate-200',    icon: <FileCheck className="h-3 w-3" /> },
  hired:          { label: 'Hired',          color: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: <CheckCircle className="h-3 w-3" /> },
  rejected:       { label: 'Rejected',       color: 'bg-red-50 text-red-700 border-red-200',             icon: <XCircle className="h-3 w-3" /> },
}

// Time filter (mirrors the Jobs page) — filters the list by candidate created_at.
type TimeFilter = '7d' | '30d' | '3m' | 'all' | 'custom'
const TIME_OPTS: { value: TimeFilter; label: string }[] = [
  { value: 'all',    label: 'All time' },
  { value: '7d',     label: 'Last 7 days' },
  { value: '30d',    label: 'Last 30 days' },
  { value: '3m',     label: 'Last 3 months' },
  { value: 'custom', label: 'Custom range' },
]

// ─────────────────────────────────────────────────────────────────────────────
// Pipeline Funnel — stage definitions + count aggregation (by candidate status)
// ─────────────────────────────────────────────────────────────────────────────

interface FunnelStageDef {
  id:   string
  name: string
}

interface FunnelAccent {
  fill:   string   // bg-* card fill
  border: string   // border-* card border
  ink:    string   // text-* for the count + stage name
  sub:    string   // text-* for the muted sublabel
  dot:    string   // bg-* for the status dot
}

// Card tints are assigned by POSITION (not by stage meaning) so the funnel reads
// like the Jobs and Requisitions summary cards: the first five slots always run
// sand → honey → sage → clay → stone, the exact warm sequence those pages use.
// Extra stages beyond five continue the same palette (blue-grey, rose) and then
// cycle. Reordering a stage adopts its new slot's colour, so every visible card
// stays a distinct hue.
const FUNNEL_PALETTE: FunnelAccent[] = [
  { fill: 'bg-[#f4eee1]', border: 'border-[#e7dcc6]', ink: 'text-[#2a2118]', sub: 'text-[#7a6f5d]', dot: 'bg-[#b29a73]' }, // sand
  { fill: 'bg-[#fbe7bc]', border: 'border-[#f1d595]', ink: 'text-[#6f450f]', sub: 'text-[#8a5a14]', dot: 'bg-[#d99a2b]' }, // honey
  { fill: 'bg-[#d9ece1]', border: 'border-[#bedccd]', ink: 'text-[#0c4634]', sub: 'text-[#15604a]', dot: 'bg-[#2f9c72]' }, // sage
  { fill: 'bg-[#f7ddc6]', border: 'border-[#eec4a4]', ink: 'text-[#6b3d17]', sub: 'text-[#8a4f18]', dot: 'bg-[#d98a4e]' }, // clay
  { fill: 'bg-[#eae6dd]', border: 'border-[#d8d2c4]', ink: 'text-[#4f483d]', sub: 'text-[#8a7f6f]', dot: 'bg-[#9a8f7d]' }, // stone
  { fill: 'bg-[#e3e7f0]', border: 'border-[#ccd4e4]', ink: 'text-[#2f3a4d]', sub: 'text-[#56627a]', dot: 'bg-[#6577a0]' }, // blue-grey
  { fill: 'bg-[#f6dcd6]', border: 'border-[#ecc0b6]', ink: 'text-[#7a2e22]', sub: 'text-[#9a5345]', dot: 'bg-[#cf6952]' }, // rose
]
const funnelAccent = (idx: number): FunnelAccent => FUNNEL_PALETTE[idx % FUNNEL_PALETTE.length]

// Active/Past split — mirrors the two-pane layout on the Jobs and Requisitions
// pages. "Active" = candidates still moving through hiring; "Past" = closed-out
// (hired/rejected) or dormant (inactive). Together these cover all CandidateStatus
// values, so every candidate lands in exactly one pane.
const ACTIVE_CANDIDATE_STATUSES: CandidateStatus[] = ['active', 'on_hold', 'interviewing', 'offer_extended']
const PAST_CANDIDATE_STATUSES:   CandidateStatus[] = ['hired', 'rejected', 'inactive']

// Funnel stages map 1:1 to the real CandidateStatus values (database.ts), so every
// card shows a true count drawn straight from candidate.status — the same vocabulary
// the Pipeline (Kanban) page uses. Each stage's `id` IS the status value, which makes
// counting a direct tally (no fuzzy mapping). Colour is positional (see FUNNEL_PALETTE).
const ALL_FUNNEL_DEFS: FunnelStageDef[] = [
  { id: 'active',         name: 'Active'         },
  { id: 'interviewing',   name: 'Interviewing'   },
  { id: 'offer_extended', name: 'Offer Extended' },
  { id: 'hired',          name: 'Hired'          },
  // Optional, off by default — real statuses, but side-states rather than forward progress.
  { id: 'on_hold',        name: 'On Hold'        },
  { id: 'inactive',       name: 'Inactive'       },
  { id: 'rejected',       name: 'Rejected'       },
]

// Bumped to v2 when the stages were re-pointed at real CandidateStatus values — the
// old key held now-invalid stage ids (sourced/screened/…), so a fresh key cleanly
// resets everyone to the sensible new default instead of a broken leftover funnel.
const LS_FUNNEL          = 'rs_candidates_funnel_v2'
// Default funnel = the forward journey only. The side-states above can be added via
// "Customise funnel".
const DEFAULT_FUNNEL_IDS = ['active', 'interviewing', 'offer_extended', 'hired']

// Count candidates per funnel stage. Stage ids equal CandidateStatus values, so this
// is a direct tally of candidate.status.
function computeFunnelCounts(candidates: CandidateListItem[]): Map<string, number> {
  const counts = new Map<string, number>()
  ALL_FUNNEL_DEFS.forEach(d => counts.set(d.id, 0))
  for (const c of candidates) {
    if (counts.has(c.status)) counts.set(c.status, (counts.get(c.status) ?? 0) + 1)
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
    <div className="border-b border-slate-100 bg-slate-50/40 px-4 py-4">
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
            className="rounded-lg bg-slate-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-slate-700 transition-colors">
            Done
          </button>
        </div>
      </div>

      <p className="mb-3 text-[10px] text-slate-400">Drag to reorder · click × to remove</p>

      {/* Discard dialog — compact, width capped so the buttons don't stretch across the card */}
      {showDiscard && (
        <div className="mb-3 max-w-md rounded-lg border border-amber-200 bg-amber-50 p-3">
          <p className="text-xs font-semibold text-slate-800">Save changes?</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <button onClick={() => setShowDiscard(false)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50 transition-colors">
              Keep editing
            </button>
            <button onClick={onDiscard}
              className="rounded-lg border border-red-200 bg-white px-3 py-1 text-[11px] font-medium text-red-600 hover:bg-red-50 transition-colors">
              Discard
            </button>
            <button onClick={onClose}
              className="rounded-lg bg-slate-600 px-3 py-1 text-[11px] font-medium text-white hover:bg-slate-700 transition-colors">
              Save
            </button>
          </div>
        </div>
      )}

      {/* Active stages */}
      <div className="mb-4">
        <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">Active stages</p>
        <div className="flex flex-wrap gap-1.5">
          {activeIds.map((id, idx) => {
            const def = ALL_FUNNEL_DEFS.find(d => d.id === id)
            if (!def) return null
            const accent = funnelAccent(idx)
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
                  isDragging ? 'opacity-40 scale-95 border-slate-300' :
                  isDragOver ? 'border-slate-400 shadow-sm ring-1 ring-slate-300 -translate-y-0.5' :
                  'border-slate-200 hover:border-slate-300'
                }`}
              >
                <GripVertical className="h-3 w-3 text-slate-300" />
                <span className={`h-2 w-2 shrink-0 rounded-full ${accent.dot}`} />
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
                className="flex items-center gap-1.5 rounded-lg border border-dashed border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-500 hover:border-slate-400 hover:bg-slate-50 hover:text-slate-600 transition-colors"
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
    <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">

      {/* Header row */}
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5">
        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Hiring Funnel</span>
        <button
          onClick={customizing ? undefined : openCustomizer}
          title="Customise funnel"
          className={`flex items-center justify-center rounded-lg border p-1.5 transition-colors ${
            customizing
              ? 'border-slate-300 bg-slate-50 text-slate-600 cursor-default'
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
        <div className="flex items-stretch px-4 py-4 gap-0">
          {activeDefs.map((def, idx) => {
            const count      = counts.get(def.id) ?? 0
            const accent     = funnelAccent(idx)
            const isLast     = idx === activeDefs.length - 1
            const isDragging = draggingId === def.id
            const isDragOver = dragOverId === def.id && draggingId !== def.id

            return (
              <div key={def.id} className="flex flex-1 min-w-0 items-center">
                {/* Stage card */}
                <div
                  draggable
                  onDragStart={() => handleDragStart(def.id)}
                  onDragOver={e => handleDragOver(e, def.id)}
                  onDrop={() => handleDrop(def.id)}
                  onDragEnd={handleDragEnd}
                  className={`flex flex-1 min-w-0 flex-col rounded-xl border px-4 py-3 select-none cursor-grab active:cursor-grabbing transition-all ${
                    accent.fill
                  } ${
                    accent.border
                  } ${
                    isDragging  ? 'opacity-40 scale-95 shadow-none' :
                    isDragOver  ? 'shadow-md ring-1 ring-slate-300 -translate-y-1' :
                    'shadow-sm hover:shadow-md hover:-translate-y-0.5'
                  }`}
                >
                  <p className={`text-2xl font-bold ${accent.ink} leading-none`}>{count}</p>
                  <div className="flex items-center gap-1.5 mt-2">
                    <span className={`h-2 w-2 shrink-0 rounded-full ${accent.dot}`} />
                    <span className={`text-[11px] font-semibold ${accent.ink} truncate leading-tight`}>{def.name}</span>
                  </div>
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
              <button onClick={openCustomizer} className="text-slate-500 hover:underline">Add some</button>
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
// CandidatesBlock — one pane (Active or Past): count badge + sortable table +
// its own pagination. Filtering/sorting is done by the page; `rows` arrive ready
// to display, `total` is the pane's unfiltered count (for the badge). Rendered
// twice, mirroring the Active/Past blocks on the Jobs and Requisitions pages.
// ─────────────────────────────────────────────────────────────────────────────

function CandidatesBlock({
  title, accent, rows, total, page, onPageChange, sortKey, sortDir, onSort, emptyText,
}: {
  title:        string
  accent:       string
  rows:         CandidateListItem[]
  total:        number
  page:         number
  onPageChange: React.Dispatch<React.SetStateAction<number>>
  sortKey:      SortKey
  sortDir:      'asc' | 'desc'
  onSort:       (key: SortKey) => void
  emptyText:    string
}) {
  const router = useRouter()

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))
  const safePage   = Math.min(page, totalPages)
  const paginated  = rows.slice((safePage - 1) * PAGE_SIZE, (safePage - 1) * PAGE_SIZE + PAGE_SIZE)

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <ChevronsUpDown className="h-3 w-3 text-slate-300 ml-1" />
    return sortDir === 'asc'
      ? <ChevronUp className="h-3 w-3 text-slate-500 ml-1" />
      : <ChevronDown className="h-3 w-3 text-slate-500 ml-1" />
  }

  const thCls = 'px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide select-none cursor-pointer hover:text-slate-800 transition-colors'

  return (
    <section className="space-y-3">
      {/* Pane header with a count badge */}
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{title}</h2>
        <span className={`inline-flex items-center justify-center rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold ${accent}`}>
          {total}
        </span>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm">
        {rows.length === 0 ? (
          <div className="py-12 text-center">
            <Users className="h-9 w-9 text-slate-200 mx-auto mb-2" />
            <p className="text-sm font-medium text-slate-500">
              {total === 0 ? emptyText : 'No candidates match your filters'}
            </p>
          </div>
        ) : (
          <>
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide w-10">#</th>
                  <th className={thCls} onClick={() => onSort('name')}>
                    <span className="flex items-center">Name <SortIcon col="name" /></span>
                  </th>
                  <th className={thCls} onClick={() => onSort('current_title')}>
                    <span className="flex items-center">Current Title <SortIcon col="current_title" /></span>
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide cursor-default">
                    Active Jobs
                  </th>
                  <th className={thCls} onClick={() => onSort('status')}>
                    <span className="flex items-center">Status <SortIcon col="status" /></span>
                  </th>
                  <th className={thCls} onClick={() => onSort('created_at')}>
                    <span className="flex items-center">Added <SortIcon col="created_at" /></span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {paginated.map((c, idx) => {
                  const s = STATUS_CONFIG[c.status]
                  return (
                    <tr
                      key={c.id}
                      onClick={() => router.push(`/candidates/${c.id}`)}
                      className="border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors cursor-pointer"
                    >
                      {/* Row number */}
                      <td className="px-4 py-3.5 text-xs text-slate-400 font-medium tabular-nums">
                        {(safePage - 1) * PAGE_SIZE + idx + 1}
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
            <div className="px-4 py-2.5 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
              <p className="text-xs text-slate-400">
                {rows.length < total
                  ? `${rows.length} match${rows.length !== 1 ? 'es' : ''} · ${total} total`
                  : `${total} candidate${total !== 1 ? 's' : ''}`}
              </p>
              {totalPages > 1 && (
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => onPageChange(p => Math.max(1, p - 1))}
                    disabled={safePage === 1}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronLeft className="h-3 w-3" /> Prev
                  </button>
                  <span className="text-xs text-slate-400 tabular-nums">{safePage} / {totalPages}</span>
                  <button
                    onClick={() => onPageChange(p => Math.min(totalPages, p + 1))}
                    disabled={safePage === totalPages}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    Next <ChevronRight className="h-3 w-3" />
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </section>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export default function CandidatesPage() {
  const { orgId } = useAuth()

  // ── List state ─────────────────────────────────────────────────────────────
  const [candidates, setCandidates] = useState<CandidateListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState<CandidateStatus | 'all'>('all')
  const [sortKey, setSortKey] = useState<SortKey>('created_at')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [activePage, setActivePage] = useState(1)
  const [pastPage,   setPastPage]   = useState(1)
  const [timeFilter, setTimeFilter]       = useState<TimeFilter>('all')
  const [showTimePicker, setShowTimePicker] = useState(false)
  const [customFrom, setCustomFrom]       = useState('')
  const [customTo, setCustomTo]           = useState('')

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
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }

  // Reset both panes to page 1 whenever any filter or sort changes.
  useEffect(() => {
    setActivePage(1); setPastPage(1)
  }, [search, filterStatus, timeFilter, customFrom, customTo, sortKey, sortDir])

  // ── Derived ────────────────────────────────────────────────────────────────
  // Time filter is the page-level scope: it narrows the candidate set that BOTH the
  // hiring funnel and the list below draw from (search + status only refine the list).
  const timeScoped = useMemo(() => {
    if (timeFilter === 'all') return candidates
    if (timeFilter === 'custom') {
      let result = candidates
      if (customFrom) result = result.filter(c => new Date(c.created_at) >= new Date(customFrom))
      if (customTo)   result = result.filter(c => new Date(c.created_at) <= new Date(customTo + 'T23:59:59'))
      return result
    }
    const now = Date.now()
    const ms  = timeFilter === '7d' ? 7 * 86_400_000 : timeFilter === '30d' ? 30 * 86_400_000 : 91 * 86_400_000
    return candidates.filter(c => now - new Date(c.created_at).getTime() <= ms)
  }, [candidates, timeFilter, customFrom, customTo])

  // Search + status refinement + sort, shared by both panes. Splitting into
  // Active/Past happens after, so both panes reflect the same search/sort.
  const refined = useMemo(() => {
    let result = [...timeScoped]
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
  }, [timeScoped, filterStatus, search, sortKey, sortDir])

  // Split the refined set into the two panes.
  const activeRows = useMemo(() => refined.filter(c => ACTIVE_CANDIDATE_STATUSES.includes(c.status)), [refined])
  const pastRows   = useMemo(() => refined.filter(c => PAST_CANDIDATE_STATUSES.includes(c.status)),   [refined])

  // Pane count badges: full (time-scoped) counts per group, so they line up with
  // the Hiring Funnel above rather than shrinking as you type in the search box.
  const activeTotal = useMemo(() => timeScoped.filter(c => ACTIVE_CANDIDATE_STATUSES.includes(c.status)).length, [timeScoped])
  const pastTotal   = useMemo(() => timeScoped.filter(c => PAST_CANDIDATE_STATUSES.includes(c.status)).length,   [timeScoped])

  const timeLabel = timeFilter === '7d' ? 'Last 7 days' : timeFilter === '30d' ? 'Last 30 days'
    : timeFilter === '3m' ? 'Last 3 months' : timeFilter === 'custom' ? 'Custom range' : 'All time'

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

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="p-6 space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Candidates</h1>
          <p className="text-sm text-slate-500 mt-0.5">Your talent pool across all roles</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Global search — filters both the Active and Past panes */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
            <input
              value={search}
              onChange={e => {
                setSearch(e.target.value)
                if (e.target.value.length > 2) trackEvent('candidates_searched', { query_length: e.target.value.length })
              }}
              placeholder="Search name, email, title…"
              className={`h-10 w-56 rounded-xl border pl-8 pr-8 text-sm outline-none focus:ring-2 focus:ring-emerald-100 focus:border-emerald-400 transition ${
                search
                  ? 'border-slate-300 bg-slate-50 text-slate-800'
                  : 'border-slate-200 bg-white text-slate-700 placeholder-slate-400'
              }`}
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2">
                <X className="h-3.5 w-3.5 text-slate-400 hover:text-slate-600" />
              </button>
            )}
          </div>
          {/* Time filter — scopes the whole page (funnel + list) */}
          <div className="relative">
            <button
              onClick={() => setShowTimePicker(p => !p)}
              className={`flex items-center gap-1.5 rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors ${
                timeFilter !== 'all'
                  ? 'border-slate-300 bg-slate-50 text-slate-700'
                  : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-800'
              }`}
              title="Time filter"
            >
              <CalendarDays className="h-4 w-4" />
              <span className="text-xs">{timeFilter !== 'all' ? timeLabel : 'All time'}</span>
            </button>
            {showTimePicker && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowTimePicker(false)} />
                <div className="absolute right-0 top-full mt-1 z-50 bg-white border border-slate-200 rounded-xl shadow-xl p-1.5 w-52">
                  {TIME_OPTS.map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => {
                        setTimeFilter(opt.value)
                        if (opt.value !== 'custom') setShowTimePicker(false)
                      }}
                      className={`w-full text-left flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                        timeFilter === opt.value ? 'bg-slate-50 text-slate-700 font-semibold' : 'text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      {opt.label}
                      {timeFilter === opt.value && <Check className="h-3 w-3 ml-auto shrink-0" />}
                    </button>
                  ))}
                  {timeFilter === 'custom' && (
                    <div className="px-2 pt-2 pb-1 border-t border-slate-100 mt-1 space-y-2">
                      <div>
                        <label className="text-xs font-medium text-slate-500 mb-1 block">From</label>
                        <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
                          className="w-full text-xs rounded-lg border border-slate-200 px-2 py-1.5 outline-none focus:border-emerald-400 transition" />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-slate-500 mb-1 block">To</label>
                        <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
                          className="w-full text-xs rounded-lg border border-slate-200 px-2 py-1.5 outline-none focus:border-emerald-400 transition" />
                      </div>
                      <button onClick={() => setShowTimePicker(false)}
                        className="w-full text-xs bg-[#221b14] text-white rounded-lg py-1.5 hover:bg-[#33271b] transition-colors font-semibold">
                        Apply
                      </button>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
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
            className="flex items-center gap-2 rounded-xl bg-[#221b14] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#33271b] transition-colors shadow-sm"
          >
            <Plus className="h-4 w-4" />
            Add Candidate
          </button>
        </div>
      </div>

      {/* Hiring Funnel — scoped to the selected time range (header time filter) */}
      <PipelineFunnel candidates={timeScoped} />

      {/* Filters — status refine + clear. Search and time filter live in the header. */}
      <div className="flex items-center gap-3">
        <select
          value={filterStatus}
          onChange={e => {
            const val = e.target.value as CandidateStatus | 'all'
            setFilterStatus(val)
            if (val !== 'all') trackEvent('candidates_filtered', { filter_type: val })
          }}
          className="shrink-0 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 transition"
        >
          <option value="all">All statuses</option>
          {(Object.keys(STATUS_CONFIG) as CandidateStatus[]).map(s => (
            <option key={s} value={s}>{STATUS_CONFIG[s].label}</option>
          ))}
        </select>

        {(filterStatus !== 'all' || search || timeFilter !== 'all') && (
          <button
            onClick={() => { setFilterStatus('all'); setSearch(''); setTimeFilter('all'); setCustomFrom(''); setCustomTo('') }}
            className="shrink-0 whitespace-nowrap text-xs text-slate-500 hover:text-slate-800 transition-colors"
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
      ) : (
        <div className="space-y-6">
          <CandidatesBlock
            title="Active"
            accent="text-emerald-700"
            rows={activeRows}
            total={activeTotal}
            page={activePage}
            onPageChange={setActivePage}
            sortKey={sortKey}
            sortDir={sortDir}
            onSort={toggleSort}
            emptyText="No active candidates"
          />
          <CandidatesBlock
            title="Past"
            accent="text-slate-500"
            rows={pastRows}
            total={pastTotal}
            page={pastPage}
            onPageChange={setPastPage}
            sortKey={sortKey}
            sortDir={sortDir}
            onSort={toggleSort}
            emptyText="No past candidates yet"
          />
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
                  <div className="flex flex-wrap gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 min-h-[44px] focus-within:border-slate-400 focus-within:ring-2 focus-within:ring-emerald-100 transition">
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
                  className="w-full flex items-center justify-center gap-2 rounded-xl bg-[#221b14] px-4 py-3 text-sm font-semibold text-white hover:bg-[#33271b] disabled:opacity-60 transition-colors shadow-sm"
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
