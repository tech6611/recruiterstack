'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Plus, Search, Clock, CheckCircle, Send, Archive, FileText, Briefcase } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
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

// The five summary stat-cards, mirroring the Jobs page (Total / Awaiting Input /
// To be Published / Active / Closed). Each card filters the table to a *bucket*
// of statuses, so all seven requisition statuses stay reachable from five cards.
const STAT_CARDS: ReadonlyArray<{
  key:      string
  label:    string
  color:    string
  statuses: Opening['status'][] | null     // null = all (the Total card)
}> = [
  { key: 'all',      label: 'Total',             color: 'bg-slate-50 border-slate-200 text-slate-700',       statuses: null },
  { key: 'pending',  label: 'Awaiting Approval', color: 'bg-amber-50 border-amber-200 text-amber-700',       statuses: ['draft', 'pending_approval'] },
  { key: 'approved', label: 'Approved',          color: 'bg-emerald-50 border-emerald-200 text-emerald-700', statuses: ['approved'] },
  { key: 'open',     label: 'Open',              color: 'bg-emerald-50 border-emerald-200 text-emerald-700',        statuses: ['open'] },
  { key: 'closed',   label: 'Closed',            color: 'bg-slate-100 border-slate-200 text-slate-500',      statuses: ['filled', 'closed', 'archived'] },
]

interface Filters {
  bucket:        string       // which stat-card is active ('all' = no status filter)
  department_id: string
  location_id:   string
  q:             string       // client-side title filter
}

export default function OpeningsListPage() {
  const [items,  setItems]  = useState<Opening[]>([])
  const [loaded, setLoaded] = useState(false)
  const [depts,  setDepts]  = useState<Department[]>([])
  const [locs,   setLocs]   = useState<LocationRow[]>([])
  const [filters, setFilters] = useState<Filters>({ bucket: 'all', department_id: '', location_id: '', q: '' })

  useEffect(() => {
    fetch('/api/departments').then(r => r.json()).then(({ data }) => setDepts(data ?? []))
    fetch('/api/locations').then(r => r.json()).then(({ data }) => setLocs(data ?? []))
  }, [])

  // Status is filtered client-side (via the stat cards) so the per-card counts
  // always reflect the full set within the current dept/location scope.
  useEffect(() => {
    const params = new URLSearchParams()
    if (filters.department_id) params.set('department_id', filters.department_id)
    if (filters.location_id)   params.set('location_id', filters.location_id)
    fetch(`/api/openings?${params}`)
      .then(r => r.json())
      .then(({ data }) => { setItems(data ?? []); setLoaded(true) })
      .catch(() => setLoaded(true))
  }, [filters.department_id, filters.location_id])

  // Counts per status within the current dept/location scope (ignores the q and
  // card filters so the cards are stable as you click between them).
  const counts = useMemo(() => {
    const c: Record<string, number> = {}
    for (const o of items) c[o.status] = (c[o.status] ?? 0) + 1
    return c
  }, [items])

  // Value shown on each stat card = sum of counts for the statuses it covers.
  const cardValue = (statuses: Opening['status'][] | null) =>
    statuses === null ? items.length : statuses.reduce((sum, s) => sum + (counts[s] ?? 0), 0)

  const filtered = useMemo(() => {
    const q = filters.q.trim().toLowerCase()
    const card = STAT_CARDS.find(c => c.key === filters.bucket)
    const allowed = card?.statuses ?? null   // null = all statuses
    return items.filter(o =>
      (!allowed || allowed.includes(o.status)) &&
      (!q || o.title.toLowerCase().includes(q)),
    )
  }, [items, filters.q, filters.bucket])

  const deptById = useMemo(() => new Map(depts.map(d => [d.id, d])), [depts])
  const locById  = useMemo(() => new Map(locs.map(l => [l.id, l])),  [locs])

  return (
    <div className="p-6 w-full space-y-5">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Requisitions</h1>
          <p className="text-sm text-slate-500 mt-0.5">Approved headcount for your team</p>
        </div>
        <Link
          href="/openings/new"
          className="inline-flex items-center gap-2 rounded-xl bg-[#221b14] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#33271b] transition-colors shadow-sm"
        >
          <Plus className="h-4 w-4" /> New requisition
        </Link>
      </div>

      {/* ── Stat cards ──────────────────────────────────────────────────── */}
      {!loaded ? (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-slate-200 bg-white p-3.5 animate-pulse">
              <div className="h-7 w-10 rounded bg-slate-200 mb-2" /><div className="h-3 w-20 rounded bg-slate-100" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {STAT_CARDS.map(stat => (
            <button
              key={stat.key}
              onClick={() => setFilters(f => ({ ...f, bucket: stat.key }))}
              className={cn(
                'rounded-xl border p-3.5 text-left transition-all hover:shadow-sm',
                stat.color,
                filters.bucket === stat.key ? 'ring-2 ring-offset-1 ring-emerald-400' : '',
              )}
            >
              <p className="text-2xl font-bold">{cardValue(stat.statuses)}</p>
              <p className="text-xs font-medium mt-0.5 opacity-70">{stat.label}</p>
            </button>
          ))}
        </div>
      )}

      {/* ── Filter bar ──────────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Search title…"
            value={filters.q}
            onChange={e => setFilters(f => ({ ...f, q: e.target.value }))}
            className="pl-9"
          />
        </div>
        <Select
          value={filters.department_id}
          onChange={e => setFilters(f => ({ ...f, department_id: e.target.value }))}
          className="w-44"
        >
          <option value="">All departments</option>
          {depts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
        </Select>
        <Select
          value={filters.location_id}
          onChange={e => setFilters(f => ({ ...f, location_id: e.target.value }))}
          className="w-44"
        >
          <option value="">All locations</option>
          {locs.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
        </Select>
      </div>

      {/* ── Table ───────────────────────────────────────────────────────── */}
      {!loaded ? (
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm" style={{ overflow: 'clip' }}>
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
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 py-16 text-center">
          <Briefcase className="h-10 w-10 text-slate-200 mx-auto mb-3" />
          <p className="text-sm font-medium text-slate-500">
            {items.length === 0 ? 'No requisitions yet' : 'No requisitions match your filters'}
          </p>
          {items.length === 0 && (
            <>
              <p className="text-xs text-slate-400 mt-1 mb-4">Create your first requisition to get started</p>
              <Link
                href="/openings/new"
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#221b14] px-4 py-2 text-sm font-semibold text-white hover:bg-[#33271b] transition-colors"
              >
                <Plus className="h-3.5 w-3.5" /> New requisition
              </Link>
            </>
          )}
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm" style={{ overflow: 'clip' }}>
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
              {filtered.map(o => {
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
              Showing {filtered.length} of {items.length} requisition{items.length !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
