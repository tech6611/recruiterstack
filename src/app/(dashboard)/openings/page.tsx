'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Plus, Search, Clock, CheckCircle, Send, Archive, FileText, Briefcase } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Card } from '@/components/ui/card'
import { STAT_TONE, statTileClass, type StatTone } from '@/lib/ui/stat-tones'
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

// The five summary stat-cards (Total / Awaiting Approval / Approved / Open /
// Closed). Now a static at-a-glance overview — the Active/Past split below does
// the filtering, and each block has its own search.
const STAT_CARDS: ReadonlyArray<{
  key:      string
  label:    string
  tone:     StatTone
  statuses: Opening['status'][] | null     // null = all (the Total card)
}> = [
  { key: 'all',      label: 'Total',             tone: 'slate', statuses: null },
  { key: 'pending',  label: 'Awaiting Approval', tone: 'amber', statuses: ['draft', 'pending_approval'] },
  { key: 'approved', label: 'Approved',          tone: 'pine',  statuses: ['approved'] },
  { key: 'open',     label: 'Open',              tone: 'gold',  statuses: ['open'] },
  { key: 'closed',   label: 'Closed',            tone: 'slate', statuses: ['filled', 'closed', 'archived'] },
]

/**
 * A self-contained requisitions block: its own header label + search/dept/location
 * filters + table. Used twice on the page — once for Active, once for Past.
 */
function OpeningsBlock({
  title, accent, openings, depts, locs, emptyText,
}: {
  title:     string
  accent:    string          // tailwind text colour for the count badge
  openings:  Opening[]
  depts:     Department[]
  locs:      LocationRow[]
  emptyText: string
}) {
  const [q, setQ]           = useState('')
  const [deptId, setDeptId] = useState('')
  const [locId, setLocId]   = useState('')

  const deptById = useMemo(() => new Map(depts.map(d => [d.id, d])), [depts])
  const locById  = useMemo(() => new Map(locs.map(l => [l.id, l])),  [locs])

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return openings.filter(o =>
      (!needle || o.title.toLowerCase().includes(needle)) &&
      (!deptId || o.department_id === deptId) &&
      (!locId  || o.location_id === locId),
    )
  }, [openings, q, deptId, locId])

  return (
    <section className="space-y-3">
      {/* Block header with a count badge */}
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{title}</h2>
        <span className={cn('inline-flex items-center justify-center rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold', accent)}>
          {openings.length}
        </span>
      </div>

      <Card className="overflow-clip border-slate-300 shadow-sm">
        {/* Filter bar — lives inside the block so each block searches itself */}
        <div className="flex flex-wrap gap-2 p-3 border-b border-slate-100 bg-slate-50/60">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Search title…"
              value={q}
              onChange={e => setQ(e.target.value)}
              className="pl-9 bg-white"
            />
          </div>
          <Select value={deptId} onChange={e => setDeptId(e.target.value)} className="w-44 bg-white">
            <option value="">All departments</option>
            {depts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </Select>
          <Select value={locId} onChange={e => setLocId(e.target.value)} className="w-44 bg-white">
            <option value="">All locations</option>
            {locs.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </Select>
        </div>

        {filtered.length === 0 ? (
          <div className="py-12 text-center">
            <Briefcase className="h-9 w-9 text-slate-200 mx-auto mb-2" />
            <p className="text-sm font-medium text-slate-500">
              {openings.length === 0 ? emptyText : 'No requisitions match your filters'}
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
                Showing {filtered.length} of {openings.length} requisition{openings.length !== 1 ? 's' : ''}
              </p>
            </div>
          </>
        )}
      </Card>
    </section>
  )
}

export default function OpeningsListPage() {
  const [items,  setItems]  = useState<Opening[]>([])
  const [loaded, setLoaded] = useState(false)
  const [depts,  setDepts]  = useState<Department[]>([])
  const [locs,   setLocs]   = useState<LocationRow[]>([])

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

  // Split into the two blocks by status.
  const active = useMemo(() => items.filter(o => ACTIVE_STATUSES.includes(o.status)), [items])
  const past   = useMemo(() => items.filter(o => PAST_STATUSES.includes(o.status)),   [items])

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
        <Link
          href="/openings/new"
          className="inline-flex items-center gap-2 rounded-xl bg-[#221b14] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#33271b] transition-colors shadow-sm"
        >
          <Plus className="h-4 w-4" /> New requisition
        </Link>
      </div>

      {/* ── Stat cards (static overview) ────────────────────────────────── */}
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
            <div key={stat.key} className={statTileClass(stat.tone, false)}>
              <p className={`text-2xl font-bold ${STAT_TONE[stat.tone].ink}`}>{cardValue(stat.statuses)}</p>
              <p className={`mt-0.5 text-xs font-medium ${STAT_TONE[stat.tone].sub}`}>{stat.label}</p>
            </div>
          ))}
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
            accent="text-emerald-700"
            openings={active}
            depts={depts}
            locs={locs}
            emptyText="No active requisitions"
          />
          <OpeningsBlock
            title="Past"
            accent="text-slate-500"
            openings={past}
            depts={depts}
            locs={locs}
            emptyText="No past requisitions yet"
          />
        </div>
      )}
    </div>
  )
}
