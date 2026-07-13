'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@clerk/nextjs'
import { useRouter } from 'next/navigation'
import {
  Plus, Mail, Loader2,
  Play, Pause, Archive, ChevronRight, ChevronDown, Copy, X, Download,
  Filter, Check, Clock, Trash2, Zap, Search,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { downloadCsv, todayStamp } from '@/lib/api/csv-export'
import { RANGE_OPTIONS, DEFAULT_RANGE } from '@/lib/sequences/range'
import type { Sequence, SequenceStatus } from '@/lib/types/database'

// ── Status config ───────────────────────────────────────────────────────────

const STATUS_BADGE: Record<SequenceStatus, { label: string; cls: string }> = {
  draft:    { label: 'Draft',    cls: 'bg-slate-100 text-slate-600 border-slate-200' },
  active:   { label: 'Active',   cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  paused:   { label: 'Paused',   cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  archived: { label: 'Archived', cls: 'bg-red-50 text-red-600 border-red-200' },
}

// ── Pane filter (state + performance) ─────────────────────────────────────────
// A filter belongs to one pane. `states` narrows by sequence status; `rules` are
// performance thresholds ANDed together (e.g. "Opened ≥ 8" AND "Reply rate ≥ 30").

type MetricKey = 'enrolled' | 'sent' | 'opened' | 'clicked' | 'replied' | 'open_rate' | 'click_rate' | 'reply_rate'

const METRIC_OPTIONS: { value: MetricKey; label: string; percent: boolean }[] = [
  { value: 'enrolled',   label: 'Enrolled',   percent: false },
  { value: 'sent',       label: 'Sent',       percent: false },
  { value: 'opened',     label: 'Opened',     percent: false },
  { value: 'clicked',    label: 'Clicked',    percent: false },
  { value: 'replied',    label: 'Replied',    percent: false },
  { value: 'open_rate',  label: 'Open rate',  percent: true },
  { value: 'click_rate', label: 'Click rate', percent: true },
  { value: 'reply_rate', label: 'Reply rate', percent: true },
]

type FilterRule = { metric: MetricKey; op: '>=' | '<='; value: number }
type PaneFilter = { states: SequenceStatus[]; rules: FilterRule[] }

const EMPTY_FILTER: PaneFilter = { states: [], rules: [] }

function metricValue(seq: Sequence, metric: MetricKey): number {
  const enrolled = seq.enrollment_count ?? 0
  const sent     = seq.sent_count ?? 0
  const opened   = seq.open_count ?? 0
  const clicked  = seq.click_count ?? 0
  const replied  = seq.reply_count ?? 0
  const pct = (num: number, den: number) => (den > 0 ? Math.round((num / den) * 100) : 0)
  switch (metric) {
    case 'enrolled':   return enrolled
    case 'sent':       return sent
    case 'opened':     return opened
    case 'clicked':    return clicked
    case 'replied':    return replied
    case 'open_rate':  return pct(opened, sent)
    case 'click_rate': return pct(clicked, sent)
    case 'reply_rate': return pct(replied, enrolled)
  }
}

function matchesFilter(seq: Sequence, f: PaneFilter): boolean {
  if (f.states.length > 0 && !f.states.includes(seq.status)) return false
  return f.rules.every(r => {
    const v = metricValue(seq, r.metric)
    return r.op === '>=' ? v >= r.value : v <= r.value
  })
}

function matchesQuery(seq: Sequence, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return seq.name.toLowerCase().includes(q)
}

const filterCount = (f: PaneFilter) => f.states.length + f.rules.length

// Foldable pane header tints — the "filled colour" blocks, mirroring the
// Openings page so Sequences matches the rest of the app. Swap these two rows
// to restyle both panes at once.
type PaneTone = { bar: string; title: string; chevron: string; badge: string }
const PANE_TINT: { active: PaneTone; archived: PaneTone } = {
  active:   { bar: 'bg-[#d9ece1] hover:bg-[#cbe4d7]', title: 'text-[#0c4634]', chevron: 'text-[#2f9c72]', badge: 'text-[#0c4634]' },
  archived: { bar: 'bg-[#eae6dd] hover:bg-[#e0dbce]', title: 'text-[#4f483d]', chevron: 'text-[#9a8f7d]', badge: 'text-[#4f483d]' },
}

// ── Time window (per pane) ────────────────────────────────────────────────────
// A pane's chosen window: a preset key ('7d'|'30d'|'90d'|'all') OR 'custom' with
// two YYYY-MM-DD dates. Both the fetch (query string) and the label read from here.
type RangeValue = { range: string; start: string; end: string }

function rangeQuery(v: RangeValue): string {
  const p = new URLSearchParams({ range: v.range })
  if (v.range === 'custom') {
    if (v.start) p.set('start', v.start)
    if (v.end) p.set('end', v.end)
  }
  return p.toString()
}

function rangeLabel(v: RangeValue): string {
  if (v.range === 'custom') {
    if (v.start && v.end) return `${v.start} → ${v.end}`
    if (v.start) return `From ${v.start}`
    if (v.end) return `Until ${v.end}`
    return 'Custom range'
  }
  return RANGE_OPTIONS.find(o => o.value === v.range)?.label ?? 'Last 30 days'
}

// ── Page ────────────────────────────────────────────────────────────────────

export default function SequencesPage() {
  const router = useRouter()
  const { orgId } = useAuth()
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)

  // Each pane keeps its OWN time window (#5): the Active pane defaults to the last
  // 30 days, the Archived pane to all-time. Because the sequence list is the same
  // either way (windowing only rescopes the funnel counts, not which rows appear),
  // we fetch the full list twice — once per window — and each pane reads its copy.
  const [activeRange, setActiveRange]     = useState<RangeValue>({ range: DEFAULT_RANGE, start: '', end: '' })
  const [archivedRange, setArchivedRange] = useState<RangeValue>({ range: 'all', start: '', end: '' })
  const [activeData, setActiveData]       = useState<Sequence[]>([])
  const [archivedData, setArchivedData]   = useState<Sequence[]>([])

  const loadActive = useCallback(async (v: RangeValue) => {
    const res = await fetch(`/api/sequences?${rangeQuery(v)}`)
    if (res.ok) setActiveData((await res.json()).data ?? [])
  }, [])
  const loadArchived = useCallback(async (v: RangeValue) => {
    const res = await fetch(`/api/sequences?${rangeQuery(v)}`)
    if (res.ok) setArchivedData((await res.json()).data ?? [])
  }, [])

  // Refresh both panes at once — used after any write (status change, clone, bulk).
  const reload = useCallback(async () => {
    await Promise.all([loadActive(activeRange), loadArchived(archivedRange)])
  }, [loadActive, loadArchived, activeRange, archivedRange])

  useEffect(() => { if (orgId) loadActive(activeRange) }, [loadActive, orgId, activeRange])
  useEffect(() => {
    if (!orgId) return
    loadArchived(archivedRange).finally(() => setLoading(false))
  }, [loadArchived, orgId, archivedRange])

  // The New Sequence button opens a type chooser first. 'drip' respects business
  // hours on every stage (outreach); 'event' fires every stage instantly
  // (transactional notifications). The choice is locked in at creation.
  const [chooserOpen, setChooserOpen] = useState(false)

  const handleCreate = async (kind: 'drip' | 'event') => {
    setCreating(true)
    const firstStage = kind === 'event'
      ? { order_index: 1, delay_days: 0, subject: 'Hi {{candidate_first_name}}', body: '<p>Write the notification that should go out the moment this fires.</p>' }
      : { order_index: 1, delay_days: 0, subject: 'Hi {{candidate_first_name}}', body: '<p>Write your first outreach email here.</p>' }
    const res = await fetch('/api/sequences', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Untitled Sequence', kind, stages: [firstStage] }),
    })
    if (res.ok) {
      const json = await res.json()
      router.push(`/sequences/${json.data.id}`)
    } else {
      setCreating(false)
      setChooserOpen(false)
    }
  }

  const handleStatusChange = async (id: string, status: SequenceStatus) => {
    const res = await fetch(`/api/sequences/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    if (res.ok) reload()
  }

  // Duplicate a sequence — server copies it (and its stages) into a fresh draft,
  // which then appears at the top of the Active pane (list is sorted newest-first).
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null)
  const handleDuplicate = async (id: string) => {
    setDuplicatingId(id)
    const res = await fetch(`/api/sequences/${id}/clone`, { method: 'POST' })
    setDuplicatingId(null)
    if (res.ok) reload()
  }

  // ── Bulk selection ────────────────────────────────────────────────────────
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkBusy, setBulkBusy] = useState(false)

  const toggleOne = (id: string) => setSelected(prev => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  })
  const setMany = (ids: string[], on: boolean) => setSelected(prev => {
    const next = new Set(prev)
    for (const id of ids) { if (on) next.add(id); else next.delete(id) }
    return next
  })
  const clearSelection = () => setSelected(new Set())

  // Apply a status to every selected sequence (parallel), then refresh + clear.
  const bulkStatus = async (status: SequenceStatus) => {
    if (selected.size === 0) return
    setBulkBusy(true)
    await Promise.all(Array.from(selected).map(id =>
      fetch(`/api/sequences/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      }),
    ))
    setBulkBusy(false)
    clearSelection()
    reload()
  }

  const bulkClone = async () => {
    if (selected.size === 0) return
    setBulkBusy(true)
    await Promise.all(Array.from(selected).map(id =>
      fetch(`/api/sequences/${id}/clone`, { method: 'POST' }),
    ))
    setBulkBusy(false)
    clearSelection()
    reload()
  }

  // ── Per-pane filters (#5) ──────────────────────────────────────────────────
  const [activeFilter, setActiveFilter]     = useState<PaneFilter>(EMPTY_FILTER)
  const [archivedFilter, setArchivedFilter] = useState<PaneFilter>(EMPTY_FILTER)
  const [activeQuery, setActiveQuery]       = useState('')
  const [archivedQuery, setArchivedQuery]   = useState('')

  // Two buckets — non-archived (active + draft + paused) vs archived — each read
  // from its own windowed fetch and then narrowed by its own name search + state/perf filter.
  const activeSeqs   = activeData.filter(s => s.status !== 'archived' && matchesQuery(s, activeQuery) && matchesFilter(s, activeFilter))
  const archivedSeqs = archivedData.filter(s => s.status === 'archived' && matchesQuery(s, archivedQuery) && matchesFilter(s, archivedFilter))
  const hasAny = activeData.length > 0 || archivedData.length > 0

  // ── Loading ──────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="px-8 py-8">
        <div className="h-8 w-48 rounded-xl bg-slate-200 animate-pulse mb-6" />
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-16 rounded-2xl bg-slate-100 animate-pulse mb-3" />
        ))}
      </div>
    )
  }

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Sequences</h1>
          <p className="text-sm text-slate-400 mt-0.5">
            Multi-stage email outreach campaigns
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Time and Download now live inside each pane header (as icons), so a
              window/export applies to just that pane. Only "New Sequence" stays here. */}
          <button
            onClick={() => setChooserOpen(true)}
            disabled={creating}
            className="flex items-center gap-2 rounded-xl bg-[#221b14] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#33271b] disabled:opacity-60 transition-colors"
          >
            {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            New Sequence
          </button>
        </div>
      </div>

      {/* New Sequence type chooser — pick drip vs event before creating */}
      {chooserOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
          onClick={() => { if (!creating) setChooserOpen(false) }}
        >
          <div
            className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="mb-1 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900">New sequence</h2>
              <button
                onClick={() => { if (!creating) setChooserOpen(false) }}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="mb-5 text-sm text-slate-400">
              Pick how this sequence should send. You can&apos;t change the type later.
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {/* Drip */}
              <button
                onClick={() => handleCreate('drip')}
                disabled={creating}
                className="group flex flex-col items-start rounded-xl border border-slate-200 p-4 text-left transition-colors hover:border-slate-900 hover:bg-slate-50 disabled:opacity-60"
              >
                <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-600 group-hover:bg-slate-900 group-hover:text-white">
                  <Clock className="h-4 w-4" />
                </div>
                <div className="text-sm font-semibold text-slate-900">Drip campaign</div>
                <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
                  Outreach and nurture. Every email respects your send window (Mon–Fri, 8am–8pm IST) so nothing lands at odd hours.
                </p>
              </button>
              {/* Event */}
              <button
                onClick={() => handleCreate('event')}
                disabled={creating}
                className="group flex flex-col items-start rounded-xl border border-slate-200 p-4 text-left transition-colors hover:border-emerald-500 hover:bg-emerald-50 disabled:opacity-60"
              >
                <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-100 text-emerald-600 group-hover:bg-emerald-600 group-hover:text-white">
                  <Zap className="h-4 w-4" />
                </div>
                <div className="text-sm font-semibold text-slate-900">Event notification</div>
                <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
                  Transactional alerts. Every email fires the moment it&apos;s due — off-hours included — for stage moves and confirmations.
                </p>
              </button>
            </div>
            {creating && (
              <div className="mt-4 flex items-center justify-center gap-2 text-xs text-slate-400">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Creating…
              </div>
            )}
          </div>
        </div>
      )}

      {/* Empty state */}
      {!hasAny && (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-50 mb-4">
            <Mail className="h-7 w-7 text-slate-500" />
          </div>
          <h2 className="text-lg font-semibold text-slate-800 mb-1">No sequences yet</h2>
          <p className="text-sm text-slate-400 max-w-sm mb-6">
            Create your first email sequence to automate candidate outreach with multi-stage drip campaigns.
          </p>
          <button
            onClick={() => setChooserOpen(true)}
            disabled={creating}
            className="flex items-center gap-2 rounded-xl bg-[#221b14] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#33271b] transition-colors"
          >
            <Plus className="h-4 w-4" /> Create Sequence
          </button>
        </div>
      )}

      {/* Bulk action bar — appears once ≥1 sequence is selected */}
      {selected.size > 0 && (
        <div className="mb-3 flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-4 py-2.5 shadow-sm">
          <span className="text-sm font-semibold text-slate-700">{selected.size} selected</span>
          <div className="mx-2 h-4 w-px bg-slate-200" />
          <button onClick={bulkClone} disabled={bulkBusy}
            className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50 transition-colors">
            <Copy className="h-3.5 w-3.5" /> Clone
          </button>
          <button onClick={() => bulkStatus('active')} disabled={bulkBusy}
            className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-emerald-600 hover:bg-emerald-50 disabled:opacity-50 transition-colors">
            <Play className="h-3.5 w-3.5" /> Activate
          </button>
          <button onClick={() => bulkStatus('paused')} disabled={bulkBusy}
            className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-amber-600 hover:bg-amber-50 disabled:opacity-50 transition-colors">
            <Pause className="h-3.5 w-3.5" /> Pause
          </button>
          <button onClick={() => bulkStatus('archived')} disabled={bulkBusy}
            className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50 transition-colors">
            <Archive className="h-3.5 w-3.5" /> Archive
          </button>
          <div className="flex-1" />
          {bulkBusy && <Loader2 className="h-4 w-4 animate-spin text-slate-400" />}
          <button onClick={clearSelection} title="Clear selection"
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Sequence list — grouped into foldable Active / Archived panes */}
      {hasAny && (
        <div className="space-y-4">
          <SequencePane
            title="Active"
            tone={PANE_TINT.active}
            count={activeSeqs.length}
            defaultOpen
            emptyText="No active sequences match."
            selectableIds={activeSeqs.map(s => s.id)}
            selected={selected}
            onToggleAll={setMany}
            filter={activeFilter}
            onFilterChange={setActiveFilter}
            query={activeQuery}
            onQueryChange={setActiveQuery}
            stateOptions={['active', 'draft', 'paused']}
            rangeValue={activeRange}
            onRangeChange={setActiveRange}
            downloadSeqs={activeSeqs}
            downloadName="active"
          >
            {activeSeqs.map(seq => (
              <SequenceRow key={seq.id} seq={seq} selected={selected.has(seq.id)} onToggleSelect={() => toggleOne(seq.id)} onOpen={() => router.push(`/sequences/${seq.id}`)} onStatus={handleStatusChange} onDuplicate={handleDuplicate} duplicating={duplicatingId === seq.id} />
            ))}
          </SequencePane>

          <SequencePane
            title="Archived"
            tone={PANE_TINT.archived}
            count={archivedSeqs.length}
            defaultOpen={false}
            emptyText="Nothing matches."
            selectableIds={archivedSeqs.map(s => s.id)}
            selected={selected}
            onToggleAll={setMany}
            filter={archivedFilter}
            onFilterChange={setArchivedFilter}
            query={archivedQuery}
            onQueryChange={setArchivedQuery}
            stateOptions={[]}
            rangeValue={archivedRange}
            onRangeChange={setArchivedRange}
            downloadSeqs={archivedSeqs}
            downloadName="archived"
          >
            {archivedSeqs.map(seq => (
              <SequenceRow key={seq.id} seq={seq} selected={selected.has(seq.id)} onToggleSelect={() => toggleOne(seq.id)} onOpen={() => router.push(`/sequences/${seq.id}`)} onStatus={handleStatusChange} onDuplicate={handleDuplicate} duplicating={duplicatingId === seq.id} />
            ))}
          </SequencePane>
        </div>
      )}
    </div>
  )
}

// ── Filter popover ────────────────────────────────────────────────────────────

// A "Filter" button that opens a popover for narrowing a pane by state and by
// performance thresholds (any metric, ≥ or ≤, absolute or %). Local draft is
// committed to the parent on Apply so typing doesn't refilter on every keystroke.
const STATE_LABEL: Record<SequenceStatus, string> = {
  draft: 'Draft', active: 'Active', paused: 'Paused', archived: 'Archived',
}

function SequenceFilterPopover({
  filter, onChange, stateOptions, tone,
}: {
  filter: PaneFilter
  onChange: (f: PaneFilter) => void
  stateOptions: SequenceStatus[]
  tone: PaneTone
}) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<PaneFilter>(filter)
  const active = filterCount(filter)

  const openMenu = () => { setDraft(filter); setOpen(true) }
  const toggleState = (s: SequenceStatus) =>
    setDraft(d => ({ ...d, states: d.states.includes(s) ? d.states.filter(x => x !== s) : [...d.states, s] }))
  const addRule    = () => setDraft(d => ({ ...d, rules: [...d.rules, { metric: 'opened', op: '>=', value: 0 }] }))
  const setRule    = (i: number, patch: Partial<FilterRule>) =>
    setDraft(d => ({ ...d, rules: d.rules.map((r, j) => (j === i ? { ...r, ...patch } : r)) }))
  const removeRule = (i: number) => setDraft(d => ({ ...d, rules: d.rules.filter((_, j) => j !== i) }))
  const apply = () => { onChange(draft); setOpen(false) }
  const clear = () => { onChange(EMPTY_FILTER); setDraft(EMPTY_FILTER); setOpen(false) }

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={open ? () => setOpen(false) : openMenu}
        title="Filter"
        className={cn('flex items-center gap-1.5 rounded-lg bg-white/70 px-2.5 py-1 text-xs font-semibold hover:bg-white transition-colors', tone.badge)}
      >
        <Filter className="h-3.5 w-3.5" />
        Filter
        {active > 0 && (
          <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-[#221b14] px-1 text-[10px] font-bold text-white">{active}</span>
        )}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-40 mt-1 w-72 rounded-xl border border-slate-200 bg-white p-3 shadow-lg">
            {stateOptions.length > 0 && (
              <div className="mb-3">
                <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">State</p>
                <div className="flex flex-wrap gap-1.5">
                  {stateOptions.map(s => (
                    <button
                      key={s}
                      onClick={() => toggleState(s)}
                      className={cn(
                        'rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors',
                        draft.states.includes(s)
                          ? 'border-[#221b14] bg-[#221b14] text-white'
                          : 'border-slate-200 text-slate-600 hover:bg-slate-50',
                      )}
                    >{STATE_LABEL[s]}</button>
                  ))}
                </div>
              </div>
            )}

            <div className="mb-2">
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Performance</p>
              <div className="space-y-2">
                {draft.rules.map((r, i) => {
                  const isPercent = METRIC_OPTIONS.find(m => m.value === r.metric)?.percent
                  return (
                    <div key={i} className="flex items-center gap-1.5">
                      <select
                        value={r.metric}
                        onChange={e => setRule(i, { metric: e.target.value as MetricKey })}
                        className="min-w-0 flex-1 rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-700 focus:border-slate-400 focus:outline-none"
                      >
                        {METRIC_OPTIONS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                      </select>
                      <select
                        value={r.op}
                        onChange={e => setRule(i, { op: e.target.value as '>=' | '<=' })}
                        className="rounded-lg border border-slate-200 px-1.5 py-1 text-xs text-slate-700 focus:border-slate-400 focus:outline-none"
                      >
                        <option value=">=">≥</option>
                        <option value="<=">≤</option>
                      </select>
                      <div className="relative w-16 shrink-0">
                        <input
                          type="number"
                          min={0}
                          value={r.value}
                          onChange={e => setRule(i, { value: Number(e.target.value) || 0 })}
                          className="w-full rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-700 focus:border-slate-400 focus:outline-none"
                        />
                        {isPercent && <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-slate-400">%</span>}
                      </div>
                      <button onClick={() => removeRule(i)} title="Remove" className="rounded-md p-1 text-slate-400 hover:bg-red-50 hover:text-red-500">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )
                })}
                <button onClick={addRule} className="flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-emerald-600">
                  <Plus className="h-3.5 w-3.5" /> Add condition
                </button>
              </div>
            </div>

            <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2">
              <button onClick={clear} className="text-xs font-medium text-slate-400 hover:text-slate-600">Clear all</button>
              <button onClick={apply} className="rounded-lg bg-[#221b14] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#33271b]">Apply</button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ── Foldable pane ─────────────────────────────────────────────────────────────

// A coloured, click-to-collapse header block + a soft-filled body holding the
// rows. Rendered twice — Active and Archived.
function SequencePane({
  title, tone, count, defaultOpen, emptyText, selectableIds, selected, onToggleAll,
  filter, onFilterChange, query, onQueryChange, stateOptions, rangeValue, onRangeChange,
  downloadSeqs, downloadName, children,
}: {
  title: string
  tone: PaneTone
  count: number
  defaultOpen: boolean
  emptyText: string
  selectableIds: string[]
  selected: Set<string>
  onToggleAll: (ids: string[], on: boolean) => void
  filter: PaneFilter
  onFilterChange: (f: PaneFilter) => void
  query: string
  onQueryChange: (q: string) => void
  stateOptions: SequenceStatus[]
  rangeValue: RangeValue
  onRangeChange: (v: RangeValue) => void
  downloadSeqs: Sequence[]
  downloadName: string
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  const allSelected  = selectableIds.length > 0 && selectableIds.every(id => selected.has(id))
  const someSelected = selectableIds.some(id => selected.has(id))
  return (
    // No overflow-hidden on the container — it used to clip the Time/Download/Filter
    // dropdowns (and hide them behind the pane below). Rounded corners come from the
    // header/body themselves instead.
    <div className="rounded-2xl border border-slate-200">
      <div className={cn('flex w-full items-center gap-2 rounded-t-2xl px-4 py-3 transition-colors', !open && 'rounded-b-2xl', tone.bar)}>
        <input
          type="checkbox"
          checked={allSelected}
          ref={el => { if (el) el.indeterminate = someSelected && !allSelected }}
          onChange={e => onToggleAll(selectableIds, e.target.checked)}
          disabled={selectableIds.length === 0}
          title="Select all"
          className="h-4 w-4 shrink-0 cursor-pointer rounded border-slate-300 accent-[#221b14] disabled:opacity-40"
        />
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          className="flex flex-1 items-center gap-2 text-left"
        >
          {open
            ? <ChevronDown className={cn('h-4 w-4 shrink-0', tone.chevron)} />
            : <ChevronRight className={cn('h-4 w-4 shrink-0', tone.chevron)} />}
          <span className={cn('text-sm font-semibold uppercase tracking-wide', tone.title)}>{title}</span>
          <span className={cn('inline-flex items-center justify-center rounded-full bg-white/70 px-2 py-0.5 text-[11px] font-semibold', tone.badge)}>
            {count}
          </span>
        </button>
        {/* Per-pane name search — narrows this pane's list as you type. */}
        <div className="relative hidden sm:block">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={query}
            onChange={e => { onQueryChange(e.target.value); if (e.target.value) setOpen(true) }}
            placeholder="Search by name…"
            className="h-8 w-44 rounded-lg border border-slate-200 bg-white/80 pl-7 pr-6 text-xs text-slate-700 placeholder:text-slate-400 focus:border-slate-300 focus:outline-none focus:ring-1 focus:ring-slate-300"
          />
          {query && (
            <button
              type="button"
              onClick={() => onQueryChange('')}
              title="Clear search"
              className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        {/* Per-pane Time + Download + Filter — all icon buttons with hover tooltips. */}
        <TimeRangeControl value={rangeValue} onChange={onRangeChange} tone={tone} />
        <DownloadControl seqs={downloadSeqs} name={downloadName} tone={tone} />
        <SequenceFilterPopover filter={filter} onChange={onFilterChange} stateOptions={stateOptions} tone={tone} />
      </div>

      {open && (
        <div className="space-y-2 rounded-b-2xl border-t border-slate-100 bg-slate-50/50 p-2">
          {count === 0
            ? <p className="py-8 text-center text-sm text-slate-400">{emptyText}</p>
            : children}
        </div>
      )}
    </div>
  )
}

// ── Per-pane Time control (#4, #5) ─────────────────────────────────────────────
// An icon button (with a hover tooltip showing the current window) that opens a
// dropdown of presets plus a "Custom range…" option with two date pickers.
function TimeRangeControl({
  value, onChange, tone,
}: {
  value: RangeValue
  onChange: (v: RangeValue) => void
  tone: PaneTone
}) {
  const [open, setOpen] = useState(false)
  const [showCustom, setShowCustom] = useState(value.range === 'custom')
  const [start, setStart] = useState(value.start)
  const [end, setEnd] = useState(value.end)

  const pickPreset = (r: string) => { onChange({ range: r, start: '', end: '' }); setShowCustom(false); setOpen(false) }
  const applyCustom = () => { onChange({ range: 'custom', start, end }); setOpen(false) }

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        title={`Time window: ${rangeLabel(value)}`}
        className={cn('flex items-center gap-1 rounded-lg bg-white/70 px-2 py-1 text-xs font-semibold hover:bg-white transition-colors', tone.badge)}
      >
        <Clock className="h-3.5 w-3.5" />
        {value.range !== DEFAULT_RANGE && <span className="h-1.5 w-1.5 rounded-full bg-[#221b14]" />}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-40 mt-1 w-56 rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
            <p className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Show activity in</p>
            {RANGE_OPTIONS.map(o => (
              <button
                key={o.value}
                onClick={() => pickPreset(o.value)}
                className="flex w-full items-center justify-between px-3 py-2 text-left text-sm text-slate-600 hover:bg-slate-50"
              >
                {o.label}
                {value.range === o.value && <Check className="h-3.5 w-3.5 text-emerald-600" />}
              </button>
            ))}
            <button
              onClick={() => setShowCustom(s => !s)}
              className="flex w-full items-center justify-between px-3 py-2 text-left text-sm text-slate-600 hover:bg-slate-50"
            >
              Custom range…
              {value.range === 'custom' && <Check className="h-3.5 w-3.5 text-emerald-600" />}
            </button>
            {showCustom && (
              <div className="border-t border-slate-100 px-3 py-2.5 space-y-2">
                <label className="block text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                  From
                  <input type="date" value={start} max={end || undefined} onChange={e => setStart(e.target.value)}
                    className="mt-0.5 w-full rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-700 focus:border-slate-400 focus:outline-none" />
                </label>
                <label className="block text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                  To
                  <input type="date" value={end} min={start || undefined} onChange={e => setEnd(e.target.value)}
                    className="mt-0.5 w-full rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-700 focus:border-slate-400 focus:outline-none" />
                </label>
                <button
                  onClick={applyCustom}
                  disabled={!start && !end}
                  className="w-full rounded-lg bg-[#221b14] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#33271b] disabled:opacity-40"
                >Apply</button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

// ── Per-pane Download control (#5) ─────────────────────────────────────────────
// One-click CSV of exactly the rows shown in this pane. The numbers are already
// scoped to the pane's window, so there's nothing more to pick.
function DownloadControl({ seqs, name, tone }: { seqs: Sequence[]; name: string; tone: PaneTone }) {
  const handleDownload = () => {
    const header = ['Name', 'Status', 'Stages', 'Enrolled', 'Sent', 'Opened', 'Clicked', 'Replied', 'Reply rate', 'Created']
    const body = seqs.map(s => {
      const enrolled = s.enrollment_count ?? 0
      const replied  = s.reply_count ?? 0
      const replyRate = enrolled > 0 ? Math.round((replied / enrolled) * 100) : 0
      return [
        s.name, s.status, s.stage_count ?? 0, enrolled, s.sent_count ?? 0,
        s.open_count ?? 0, s.click_count ?? 0, replied, `${replyRate}%`,
        s.created_at?.slice(0, 10) ?? '',
      ]
    })
    downloadCsv(`sequences-${name}-${todayStamp()}.csv`, [header, ...body])
  }
  return (
    <button
      type="button"
      onClick={handleDownload}
      disabled={seqs.length === 0}
      title="Download this pane as CSV"
      className={cn('flex items-center rounded-lg bg-white/70 px-2 py-1 text-xs font-semibold hover:bg-white transition-colors disabled:opacity-40', tone.badge)}
    >
      <Download className="h-3.5 w-3.5" />
    </button>
  )
}

// ── Sequence row ──────────────────────────────────────────────────────────────

function SequenceRow({
  seq, selected, onToggleSelect, onOpen, onStatus, onDuplicate, duplicating,
}: {
  seq: Sequence
  selected: boolean
  onToggleSelect: () => void
  onOpen: () => void
  onStatus: (id: string, status: SequenceStatus) => void
  onDuplicate: (id: string) => void
  duplicating: boolean
}) {
  const badge = STATUS_BADGE[seq.status] ?? STATUS_BADGE.draft
  const replyRate = seq.enrollment_count && seq.reply_count
    ? Math.round((seq.reply_count / seq.enrollment_count) * 100)
    : 0

  // Funnel shown on each row: Stages → Enrolled → Sent → Opened → Clicked → Replied.
  const stats = [
    { label: 'Stages',   value: seq.stage_count ?? 0,      cls: 'text-slate-700' },
    { label: 'Enrolled', value: seq.enrollment_count ?? 0, cls: 'text-slate-700' },
    { label: 'Sent',     value: seq.sent_count ?? 0,       cls: 'text-slate-700' },
    { label: 'Opened',   value: seq.open_count ?? 0,       cls: 'text-slate-600' },
    { label: 'Clicked',  value: seq.click_count ?? 0,      cls: 'text-slate-600' },
    { label: 'Replied',  value: `${seq.reply_count ?? 0}${replyRate ? ` (${replyRate}%)` : ''}`, cls: 'text-emerald-600' },
  ]

  return (
    <div
      onClick={onOpen}
      className="group flex items-center gap-4 rounded-xl border border-slate-200 bg-white px-5 py-4 hover:border-slate-300 hover:shadow-sm cursor-pointer transition-all"
    >
      {/* Row select checkbox */}
      <input
        type="checkbox"
        checked={selected}
        onChange={onToggleSelect}
        onClick={e => e.stopPropagation()}
        className="h-4 w-4 shrink-0 cursor-pointer rounded border-slate-300 accent-[#221b14]"
      />

      {/* Icon */}
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
        seq.status === 'active' ? 'bg-emerald-50' : 'bg-slate-50'
      }`}>
        <Mail className={`h-5 w-5 ${seq.status === 'active' ? 'text-emerald-500' : 'text-slate-400'}`} />
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold text-slate-800 truncate">{seq.name}</p>
          <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${badge.cls}`}>
            {badge.label}
          </span>
          {seq.kind === 'event' && (
            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
              <Zap className="h-2.5 w-2.5" /> Event
            </span>
          )}
        </div>
        {seq.description && (
          <p className="text-xs text-slate-400 mt-0.5 truncate">{seq.description}</p>
        )}
      </div>

      {/* Stats funnel — hidden on very small screens to avoid cramping */}
      <div className="hidden sm:flex items-center gap-5 shrink-0 text-xs text-slate-500">
        {stats.map(s => (
          <div key={s.label} className="w-14 text-center">
            <p className={`font-bold ${s.cls}`}>{s.value}</p>
            <p>{s.label}</p>
          </div>
        ))}
      </div>

      {/* Actions — always visible; the label tooltips still appear only on hover */}
      <div className="flex items-center gap-1 shrink-0"
           onClick={e => e.stopPropagation()}>
        <button
          onClick={() => onDuplicate(seq.id)}
          disabled={duplicating}
          title="Clone"
          className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors disabled:opacity-50"
        >
          {duplicating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Copy className="h-4 w-4" />}
        </button>
        {(seq.status === 'draft' || seq.status === 'paused') && (
          <button
            onClick={() => onStatus(seq.id, 'active')}
            title="Activate"
            className="rounded-lg p-1.5 text-emerald-500 hover:bg-emerald-50 transition-colors"
          >
            <Play className="h-4 w-4" />
          </button>
        )}
        {seq.status === 'active' && (
          <button
            onClick={() => onStatus(seq.id, 'paused')}
            title="Pause"
            className="rounded-lg p-1.5 text-amber-500 hover:bg-amber-50 transition-colors"
          >
            <Pause className="h-4 w-4" />
          </button>
        )}
        {seq.status === 'archived' ? (
          <button
            onClick={() => onStatus(seq.id, 'draft')}
            title="Restore"
            className="rounded-lg p-1.5 text-emerald-500 hover:bg-emerald-50 transition-colors"
          >
            <Play className="h-4 w-4" />
          </button>
        ) : (
          <button
            onClick={() => onStatus(seq.id, 'archived')}
            title="Archive"
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 transition-colors"
          >
            <Archive className="h-4 w-4" />
          </button>
        )}
      </div>

      <ChevronRight className="h-4 w-4 text-slate-300 shrink-0" />
    </div>
  )
}
