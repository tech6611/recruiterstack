'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Plus, Clock, CheckCircle, Send, Archive, FileText, Briefcase, ChevronDown, ChevronRight } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { type StatTone } from '@/lib/ui/stat-tones'
import { StatCards } from '@/components/ui/stat-cards'
import { cn } from '@/lib/utils'
import {
  PaneSearchInput, TimeRangeControl, PaneDownloadButton, PaneFilterControl,
  ALL_RANGE_VALUE, withinRange, rowMatchesFilters, todayStamp,
  type RangeValue, type FilterFieldDef, type FilterCondition,
} from '@/components/panes/pane-controls'
import type { Opening, Department, Location as LocationRow } from '@/lib/types/requisitions'

// Per-status badge config — mirrors the Jobs page (src/app/(dashboard)/jobs/page.tsx
// STATUS_CONFIG) so requisition status pills look identical: colored bg + border,
// small icon, and a friendly label.
const STATUS_CONFIG: Record<Opening['status'], { label: string; color: string; icon: React.ReactNode }> = {
  draft:            { label: 'Draft',            color: 'bg-slate-50 text-slate-600 border-slate-200',       icon: <FileText className="h-3 w-3" /> },
  pending_approval: { label: 'Pending Approval', color: 'bg-amber-50 text-amber-700 border-amber-200',       icon: <Clock className="h-3 w-3" /> },
  approved:         { label: 'Approved',         color: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: <CheckCircle className="h-3 w-3" /> },
  open:             { label: 'Open',             color: 'bg-emerald-50 text-emerald-700 border-emerald-200',       icon: <Send className="h-3 w-3" /> },
  filled:           { label: 'Filled',           color: 'bg-slate-50 text-slate-700 border-slate-200',    icon: <CheckCircle className="h-3 w-3" /> },
  closed:           { label: 'Closed',           color: 'bg-slate-100 text-slate-500 border-slate-200',      icon: <Archive className="h-3 w-3" /> },
  archived:         { label: 'Archived',         color: 'bg-slate-100 text-slate-400 border-slate-200',      icon: <Archive className="h-3 w-3" /> },
}

// Which statuses are "live work" vs "history". Everything still moving through
// the funnel lives in the Active block; anything terminal lives in Past.
const ACTIVE_STATUSES: Opening['status'][] = ['draft', 'pending_approval', 'approved', 'open']
const PAST_STATUSES:   Opening['status'][] = ['filled', 'closed', 'archived']

// The five summary stat-cards (Total / Awaiting Approval / Approved / Open /
// Closed). A static at-a-glance overview — the Active/Past split below does the
// listing, and a single shared toolbar (search / time / dept / location) filters
// both blocks at once.
const STAT_CARDS: ReadonlyArray<{
  key:      string
  label:    string
  tone:     StatTone
  icon:     React.ReactNode
  statuses: Opening['status'][] | null     // null = all (the Total card)
}> = [
  { key: 'all',      label: 'Total',             tone: 'slate', icon: <FileText className="h-4 w-4" />,    statuses: null },
  { key: 'pending',  label: 'Awaiting Approval', tone: 'amber', icon: <Clock className="h-4 w-4" />,       statuses: ['draft', 'pending_approval'] },
  { key: 'approved', label: 'Approved',          tone: 'pine',  icon: <CheckCircle className="h-4 w-4" />, statuses: ['approved'] },
  { key: 'open',     label: 'Open',              tone: 'gold',  icon: <Send className="h-4 w-4" />,        statuses: ['open'] },
  { key: 'closed',   label: 'Closed',            tone: 'stone', icon: <Archive className="h-4 w-4" />,     statuses: ['filled', 'closed', 'archived'] },
]

// Foldable pane header ("fixed block") tints. COLOUR OPTION: swap these values to
// restyle both panes at once — the single place that controls Active/Past colours.
type PaneTone = { bar: string; title: string; chevron: string }
const PANE_TINT: { active: PaneTone; past: PaneTone } = {
  active: { bar: 'bg-[#d9ece1] hover:bg-[#cbe4d7]', title: 'text-[#0c4634]', chevron: 'text-[#2f9c72]' },
  past:   { bar: 'bg-[#eae6dd] hover:bg-[#e0dbce]', title: 'text-[#4f483d]', chevron: 'text-[#9a8f7d]' },
}

/**
 * A presentational, foldable requisitions block: a coloured header bar (click to
 * collapse/expand) + count badge + table. All filtering is done by the page and
 * passed down — `rows` are the already-filtered requisitions, `total` is the
 * block's unfiltered count. Rendered twice — once for Active, once for Past.
 */
function OpeningsBlock({
  title, tint, accent, rows, total, deptById, locById, emptyText,
  query, onQueryChange, range, onRangeChange, downloadName,
  filterFields, filters, onFiltersChange,
}: {
  title:     string
  tint:      PaneTone
  accent:    string          // tailwind text colour for the count badge + controls
  rows:      Opening[]
  total:     number
  deptById:  Map<string, Department>
  locById:   Map<string, LocationRow>
  emptyText: string
  query:        string
  onQueryChange: (q: string) => void
  range:         RangeValue
  onRangeChange: (v: RangeValue) => void
  downloadName:  string
  filterFields:  FilterFieldDef[]
  filters:       FilterCondition[]
  onFiltersChange: (c: FilterCondition[]) => void
}) {
  const [open, setOpen] = useState(true)

  // CSV grid for this pane's Download button — exactly the rows on screen.
  const csvRows = useMemo(() => {
    const header = ['Title', 'Status', 'Department', 'Location', 'Comp', 'Target start', 'Created']
    const body = rows.map(o => {
      const dept = o.department_id ? deptById.get(o.department_id) : null
      const loc  = o.location_id   ? locById.get(o.location_id)    : null
      const comp = o.comp_min !== null && o.comp_max !== null
        ? `${o.comp_currency} ${Number(o.comp_min).toLocaleString()}–${Number(o.comp_max).toLocaleString()}`
        : ''
      return [
        o.title, STATUS_CONFIG[o.status].label, dept?.name ?? '', loc?.name ?? '',
        comp, o.target_start_date ?? '', o.created_at?.slice(0, 10) ?? '',
      ]
    })
    return [header, ...body]
  }, [rows, deptById, locById])

  return (
    <div className="rounded-2xl border border-slate-300 bg-white shadow-sm">
      {/* Foldable pane header — the coloured "fixed block" with its own toolbar. */}
      <div className={cn('flex w-full items-center gap-2 rounded-t-2xl px-4 py-3 transition-colors', !open && 'rounded-b-2xl', tint.bar)}>
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          className="flex flex-1 items-center gap-2 text-left"
        >
          {open
            ? <ChevronDown className={cn('h-4 w-4 shrink-0', tint.chevron)} />
            : <ChevronRight className={cn('h-4 w-4 shrink-0', tint.chevron)} />}
          <span className={cn('text-sm font-semibold uppercase tracking-wide', tint.title)}>{title}</span>
          <span className={cn('inline-flex items-center justify-center rounded-full bg-white/70 px-2 py-0.5 text-[11px] font-semibold', accent)}>
            {total}
          </span>
        </button>
        {/* Per-pane Search + Time + Download — same controls as the Sequences panes. */}
        <PaneSearchInput
          query={query}
          onQueryChange={q => { onQueryChange(q); if (q) setOpen(true) }}
          placeholder="Search by name…"
        />
        <TimeRangeControl value={range} onChange={onRangeChange} badgeClass={accent} />
        <PaneDownloadButton filename={`requisitions-${downloadName}-${todayStamp()}.csv`} rows={csvRows} badgeClass={accent} />
        <PaneFilterControl fields={filterFields} conditions={filters} onChange={c => { onFiltersChange(c); if (c.length) setOpen(true) }} badgeClass={accent} />
      </div>

      {open && (
        <div className="overflow-hidden rounded-b-2xl border-t border-slate-100">
        {rows.length === 0 ? (
          <div className="py-12 text-center">
            <Briefcase className="h-9 w-9 text-slate-200 mx-auto mb-2" />
            <p className="text-sm font-medium text-slate-500">
              {total === 0 ? emptyText : 'No requisitions match your filters'}
            </p>
          </div>
        ) : (
          <>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50 text-slate-500">
                  <th className="text-left px-4 py-3 font-medium">Title</th>
                  <th className="text-left px-4 py-3 font-medium">Status</th>
                  <th className="text-left px-4 py-3 font-medium">Department</th>
                  <th className="text-left px-4 py-3 font-medium">Location</th>
                  <th className="text-left px-4 py-3 font-medium">Comp</th>
                  <th className="text-left px-4 py-3 font-medium">Target start</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(o => {
                  const dept = o.department_id ? deptById.get(o.department_id) : null
                  const loc  = o.location_id   ? locById.get(o.location_id)    : null
                  const sc   = STATUS_CONFIG[o.status]
                  return (
                    <tr key={o.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3.5">
                        <Link href={`/openings/${o.id}`} className="font-medium text-slate-900 hover:text-emerald-700">
                          {o.title}
                        </Link>
                      </td>
                      <td className="px-4 py-3.5">
                        <span className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium capitalize', sc.color)}>
                          {sc.icon} {sc.label}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-slate-600">{dept?.name ?? '—'}</td>
                      <td className="px-4 py-3.5 text-slate-600">{loc?.name ?? '—'}</td>
                      <td className="px-4 py-3.5 text-slate-600">
                        {o.comp_min !== null && o.comp_max !== null
                          ? `${o.comp_currency} ${Number(o.comp_min).toLocaleString()}–${Number(o.comp_max).toLocaleString()}${o.out_of_band ? ' ⚠' : ''}`
                          : '—'}
                      </td>
                      <td className="px-4 py-3.5 text-slate-600">{o.target_start_date ?? '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>

            <div className="px-4 py-2.5 border-t border-slate-100 bg-slate-50">
              <p className="text-xs text-slate-400">
                Showing {rows.length} of {total} requisition{total !== 1 ? 's' : ''}
              </p>
            </div>
          </>
        )}
        </div>
      )}
    </div>
  )
}

export default function OpeningsListPage() {
  const [items,  setItems]  = useState<Opening[]>([])
  const [loaded, setLoaded] = useState(false)
  const [depts,  setDepts]  = useState<Department[]>([])
  const [locs,   setLocs]   = useState<LocationRow[]>([])

  // ── Per-pane search + time window + filters (each pane filters independently) ─
  const [activeQuery, setActiveQuery] = useState('')
  const [pastQuery,   setPastQuery]   = useState('')
  const [activeRange, setActiveRange] = useState<RangeValue>(ALL_RANGE_VALUE)
  const [pastRange,   setPastRange]   = useState<RangeValue>(ALL_RANGE_VALUE)
  const [activeFilters, setActiveFilters] = useState<FilterCondition[]>([])
  const [pastFilters,   setPastFilters]   = useState<FilterCondition[]>([])

  useEffect(() => {
    fetch('/api/departments').then(r => r.json()).then(({ data }) => setDepts(data ?? []))
    fetch('/api/locations').then(r => r.json()).then(({ data }) => setLocs(data ?? []))
  }, [])

  useEffect(() => {
    fetch('/api/openings')
      .then(r => r.json())
      .then(({ data }) => { setItems(data ?? []); setLoaded(true) })
      .catch(() => setLoaded(true))
  }, [])

  const deptById = useMemo(() => new Map(depts.map(d => [d.id, d])), [depts])
  const locById  = useMemo(() => new Map(locs.map(l => [l.id, l])),  [locs])

  // Split into the two blocks by status.
  const active = useMemo(() => items.filter(o => ACTIVE_STATUSES.includes(o.status)), [items])
  const past   = useMemo(() => items.filter(o => PAST_STATUSES.includes(o.status)),   [items])

  // Fields the per-pane Filter popover can filter on — every column, whether or
  // not it's shown. Department/Location options come from the loaded lists.
  const filterFields = useMemo<FilterFieldDef[]>(() => [
    { key: 'title',      label: 'Title',      type: 'text' },
    { key: 'status',     label: 'Status',     type: 'select', options: (Object.keys(STATUS_CONFIG) as Opening['status'][]).map(s => ({ value: s, label: STATUS_CONFIG[s].label })) },
    { key: 'department', label: 'Department', type: 'select', options: depts.map(d => ({ value: d.name, label: d.name })) },
    { key: 'location',   label: 'Location',   type: 'select', options: locs.map(l => ({ value: l.name, label: l.name })) },
  ], [depts, locs])

  // A requisition's value for a given filter field (used by rowMatchesFilters).
  const fieldValue = useCallback((o: Opening, key: string): string => {
    switch (key) {
      case 'title':      return o.title ?? ''
      case 'status':     return o.status ?? ''
      case 'department': return o.department_id ? (deptById.get(o.department_id)?.name ?? '') : ''
      case 'location':   return o.location_id   ? (locById.get(o.location_id)?.name  ?? '') : ''
      default:           return ''
    }
  }, [deptById, locById])

  // Filter a block by its own search text + time window + filter conditions.
  // Search matches title + department + location name; the time window applies to
  // created_at; the Filter popover conditions apply to any field.
  const makeFilter = useCallback((list: Opening[], query: string, range: RangeValue, filters: FilterCondition[]) => {
    const needle = query.trim().toLowerCase()
    return list.filter(o => {
      if (needle) {
        const deptName = o.department_id ? (deptById.get(o.department_id)?.name ?? '') : ''
        const locName  = o.location_id   ? (locById.get(o.location_id)?.name  ?? '') : ''
        const hay = `${o.title} ${deptName} ${locName}`.toLowerCase()
        if (!hay.includes(needle)) return false
      }
      if (!withinRange(o.created_at, range)) return false
      if (!rowMatchesFilters(filters, filterFields, key => fieldValue(o, key))) return false
      return true
    })
  }, [deptById, locById, filterFields, fieldValue])

  const activeRows = useMemo(() => makeFilter(active, activeQuery, activeRange, activeFilters), [makeFilter, active, activeQuery, activeRange, activeFilters])
  const pastRows   = useMemo(() => makeFilter(past,   pastQuery,   pastRange,   pastFilters),   [makeFilter, past,   pastQuery,   pastRange,   pastFilters])

  // Stat-card values (static overview over all items).
  const counts = useMemo(() => {
    const c: Record<string, number> = {}
    for (const o of items) c[o.status] = (c[o.status] ?? 0) + 1
    return c
  }, [items])
  const cardValue = (statuses: Opening['status'][] | null) =>
    statuses === null ? items.length : statuses.reduce((sum, s) => sum + (counts[s] ?? 0), 0)

  return (
    <div className="p-6 w-full space-y-5">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Requisitions</h1>
          <p className="text-sm text-slate-500 mt-0.5">Approved headcount for your team</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Search + time now live on each pane's toolbar (see OpeningsBlock). */}
          <Link
            href="/openings/new"
            className="inline-flex items-center gap-2 rounded-xl bg-[#221b14] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#33271b] transition-colors shadow-sm"
          >
            <Plus className="h-4 w-4" /> New requisition
          </Link>
        </div>
      </div>

      {/* ── Stat cards (static overview) ────────────────────────────────── */}
      {!loaded ? (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 animate-pulse">
              <div className="h-10 w-10 shrink-0 rounded-lg bg-slate-200" />
              <div className="flex-1"><div className="h-5 w-10 rounded bg-slate-200" /><div className="h-2.5 w-16 rounded bg-slate-100 mt-1.5" /></div>
            </div>
          ))}
        </div>
      ) : (
        <StatCards
          cards={STAT_CARDS.map(stat => ({
            key: stat.key, label: stat.label, tone: stat.tone,
            value: cardValue(stat.statuses), icon: stat.icon,
          }))}
        />
      )}

      {/* Department & Location filtering now lives in each pane's Filter popover
          (alongside Status and Title), so there's one place to filter. */}

      {/* ── Active + Past blocks ────────────────────────────────────────── */}
      {!loaded ? (
        <Card className="overflow-clip">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                {['Title', 'Status', 'Department', 'Location', 'Comp', 'Target start'].map(h => (
                  <th key={h} className="text-left px-4 py-3 font-medium text-slate-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-b border-slate-100 last:border-0">
                  {Array.from({ length: 6 }).map((_, j) => (
                    <td key={j} className="px-4 py-3.5"><div className="h-3 w-24 rounded bg-slate-100 animate-pulse" /></td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ) : (
        <div className="space-y-6">
          <OpeningsBlock
            title="Active"
            tint={PANE_TINT.active}
            accent="text-[#0c4634]"
            rows={activeRows}
            total={active.length}
            deptById={deptById}
            locById={locById}
            emptyText="No active requisitions"
            query={activeQuery}
            onQueryChange={setActiveQuery}
            range={activeRange}
            onRangeChange={setActiveRange}
            downloadName="active"
            filterFields={filterFields}
            filters={activeFilters}
            onFiltersChange={setActiveFilters}
          />
          <OpeningsBlock
            title="Past"
            tint={PANE_TINT.past}
            accent="text-[#4f483d]"
            rows={pastRows}
            total={past.length}
            deptById={deptById}
            locById={locById}
            emptyText="No past requisitions yet"
            query={pastQuery}
            onQueryChange={setPastQuery}
            range={pastRange}
            onRangeChange={setPastRange}
            downloadName="past"
            filterFields={filterFields}
            filters={pastFilters}
            onFiltersChange={setPastFilters}
          />
        </div>
      )}
    </div>
  )
}
