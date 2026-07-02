'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Plus, Search, Clock, CheckCircle, Send, Archive, FileText, Briefcase, CalendarDays, Check, X, ChevronDown, ChevronRight } from 'lucide-react'
import { Select } from '@/components/ui/select'
import { Card } from '@/components/ui/card'
import { type StatTone } from '@/lib/ui/stat-tones'
import { StatCards } from '@/components/ui/stat-cards'
import { cn } from '@/lib/utils'
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

// Time filter presets — mirrors the Jobs page so both list pages share the same
// created_at date scoping (Last 7 days / 30 days / 3 months / All / Custom range).
type TimeFilter = '7d' | '30d' | '3m' | 'all' | 'custom'
const TIME_OPTS: { value: TimeFilter; label: string }[] = [
  { value: '7d',     label: 'Last 7 days'   },
  { value: '30d',    label: 'Last 30 days'  },
  { value: '3m',     label: 'Last 3 months' },
  { value: 'all',    label: 'All time'      },
  { value: 'custom', label: 'Custom range'  },
]

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
  active: { bar: 'bg-[#f4eee1] hover:bg-[#ece4d3]', title: 'text-[#4f4335]', chevron: 'text-[#a1876a]' },
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
}: {
  title:     string
  tint:      PaneTone
  accent:    string          // tailwind text colour for the count badge
  rows:      Opening[]
  total:     number
  deptById:  Map<string, Department>
  locById:   Map<string, LocationRow>
  emptyText: string
}) {
  const [open, setOpen] = useState(true)
  return (
    <Card className="overflow-clip border-slate-300 shadow-sm">
      {/* Foldable pane header — the coloured "fixed block". Click to collapse/expand. */}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={cn('flex w-full items-center gap-2 px-4 py-3 text-left transition-colors', tint.bar)}
      >
        {open
          ? <ChevronDown className={cn('h-4 w-4 shrink-0', tint.chevron)} />
          : <ChevronRight className={cn('h-4 w-4 shrink-0', tint.chevron)} />}
        <span className={cn('text-sm font-semibold uppercase tracking-wide', tint.title)}>{title}</span>
        <span className={cn('inline-flex items-center justify-center rounded-full bg-white/70 px-2 py-0.5 text-[11px] font-semibold', accent)}>
          {total}
        </span>
      </button>

      {open && (
        <div className="border-t border-slate-100">
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
    </Card>
  )
}

export default function OpeningsListPage() {
  const [items,  setItems]  = useState<Opening[]>([])
  const [loaded, setLoaded] = useState(false)
  const [depts,  setDepts]  = useState<Department[]>([])
  const [locs,   setLocs]   = useState<LocationRow[]>([])

  // ── Shared filter state (drives BOTH the Active and Past blocks) ──────────
  const [q,      setQ]      = useState('')
  const [deptId, setDeptId] = useState('')
  const [locId,  setLocId]  = useState('')
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('all')
  const [customFrom,  setCustomFrom]  = useState('')
  const [customTo,    setCustomTo]    = useState('')
  const [showTimePicker, setShowTimePicker] = useState(false)

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

  // One shared filter applied to whichever block we're rendering. Search matches
  // title + department name + location name; dept/location dropdowns and the time
  // filter (on created_at) narrow further — identical scoping for both blocks.
  const applyFilters = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const now = Date.now()
    return (list: Opening[]) => list.filter(o => {
      if (deptId && o.department_id !== deptId) return false
      if (locId  && o.location_id   !== locId)  return false
      if (needle) {
        const deptName = o.department_id ? (deptById.get(o.department_id)?.name ?? '') : ''
        const locName  = o.location_id   ? (locById.get(o.location_id)?.name  ?? '') : ''
        const hay = `${o.title} ${deptName} ${locName}`.toLowerCase()
        if (!hay.includes(needle)) return false
      }
      if (timeFilter !== 'all') {
        if (timeFilter === 'custom') {
          if (customFrom && new Date(o.created_at) < new Date(customFrom)) return false
          if (customTo   && new Date(o.created_at) > new Date(customTo + 'T23:59:59')) return false
        } else {
          const ms = timeFilter === '7d' ? 7 * 86_400_000 : timeFilter === '30d' ? 30 * 86_400_000 : 91 * 86_400_000
          if (now - new Date(o.created_at).getTime() > ms) return false
        }
      }
      return true
    })
  }, [q, deptId, locId, timeFilter, customFrom, customTo, deptById, locById])

  const activeRows = useMemo(() => applyFilters(active), [applyFilters, active])
  const pastRows   = useMemo(() => applyFilters(past),   [applyFilters, past])

  const timeLabel = timeFilter === '7d' ? 'Last 7 days' : timeFilter === '30d' ? 'Last 30 days'
    : timeFilter === '3m' ? 'Last 3 months' : timeFilter === 'custom' ? 'Custom range' : 'All time'

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
          {/* Global search (filters both Active and Past) */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
            <input
              type="text"
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="Search requisitions…"
              className={`h-9 w-52 rounded-xl border pl-8 pr-8 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent ${
                q
                  ? 'border-slate-300 bg-slate-50 text-slate-800'
                  : 'border-slate-200 bg-white text-slate-700 placeholder-slate-400'
              }`}
            />
            {q && (
              <button
                onClick={() => setQ('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Time filter icon + dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowTimePicker(p => !p)}
              className={`flex items-center gap-1.5 rounded-xl border px-3 py-2 text-sm font-medium transition-colors ${
                timeFilter !== 'all'
                  ? 'border-slate-300 bg-slate-50 text-slate-700'
                  : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-800'
              }`}
              title="Time filter"
            >
              <CalendarDays className="h-4 w-4" />
              {timeFilter !== 'all' && <span className="text-xs">{timeLabel}</span>}
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

      {/* ── Shared department / location filter bar (drives both blocks) ─── */}
      {loaded && (
        <div className="flex flex-wrap gap-2">
          <Select value={deptId} onChange={e => setDeptId(e.target.value)} className="w-44 bg-white">
            <option value="">All departments</option>
            {depts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </Select>
          <Select value={locId} onChange={e => setLocId(e.target.value)} className="w-44 bg-white">
            <option value="">All locations</option>
            {locs.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </Select>
        </div>
      )}

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
            accent="text-[#4f4335]"
            rows={activeRows}
            total={active.length}
            deptById={deptById}
            locById={locById}
            emptyText="No active requisitions"
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
          />
        </div>
      )}
    </div>
  )
}
