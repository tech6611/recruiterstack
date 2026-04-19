'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Plus, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import type { Opening, Department, Location as LocationRow } from '@/lib/types/requisitions'

const STATUS_OPTIONS: Array<Opening['status']> = [
  'draft', 'pending_approval', 'approved', 'open', 'filled', 'closed', 'archived',
]

const STATUS_BADGE: Record<Opening['status'], string> = {
  draft:            'bg-slate-100 text-slate-700',
  pending_approval: 'bg-amber-100 text-amber-800',
  approved:         'bg-emerald-100 text-emerald-800',
  open:             'bg-blue-100 text-blue-800',
  filled:           'bg-violet-100 text-violet-800',
  closed:           'bg-slate-200 text-slate-600',
  archived:         'bg-slate-100 text-slate-400',
}

interface Filters {
  status:        string
  department_id: string
  location_id:   string
  q:             string       // client-side title filter
}

export default function OpeningsListPage() {
  const [items,  setItems]  = useState<Opening[]>([])
  const [loaded, setLoaded] = useState(false)
  const [depts,  setDepts]  = useState<Department[]>([])
  const [locs,   setLocs]   = useState<LocationRow[]>([])
  const [filters, setFilters] = useState<Filters>({ status: '', department_id: '', location_id: '', q: '' })

  useEffect(() => {
    fetch('/api/departments').then(r => r.json()).then(({ data }) => setDepts(data ?? []))
    fetch('/api/locations').then(r => r.json()).then(({ data }) => setLocs(data ?? []))
  }, [])

  useEffect(() => {
    const params = new URLSearchParams()
    if (filters.status)        params.set('status', filters.status)
    if (filters.department_id) params.set('department_id', filters.department_id)
    if (filters.location_id)   params.set('location_id', filters.location_id)
    fetch(`/api/openings?${params}`)
      .then(r => r.json())
      .then(({ data }) => { setItems(data ?? []); setLoaded(true) })
      .catch(() => setLoaded(true))
  }, [filters.status, filters.department_id, filters.location_id])

  const filtered = useMemo(() => {
    const q = filters.q.trim().toLowerCase()
    if (!q) return items
    return items.filter(o => o.title.toLowerCase().includes(q))
  }, [items, filters.q])

  const deptById = useMemo(() => new Map(depts.map(d => [d.id, d])), [depts])
  const locById  = useMemo(() => new Map(locs.map(l => [l.id, l])),  [locs])

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Openings</h1>
          <p className="text-sm text-slate-500 mt-1">Approved headcount for your team.</p>
        </div>
        <Link href="/openings/new">
          <Button><Plus className="h-4 w-4" /> New opening</Button>
        </Link>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-4">
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
          value={filters.status}
          onChange={e => setFilters(f => ({ ...f, status: e.target.value }))}
          className="w-44"
        >
          <option value="">All statuses</option>
          {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
        </Select>
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

      {/* Table */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
            <tr>
              <th className="text-left px-4 py-3 font-medium">Title</th>
              <th className="text-left px-4 py-3 font-medium">Status</th>
              <th className="text-left px-4 py-3 font-medium">Department</th>
              <th className="text-left px-4 py-3 font-medium">Location</th>
              <th className="text-left px-4 py-3 font-medium">Comp</th>
              <th className="text-left px-4 py-3 font-medium">Target start</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {!loaded && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">Loading…</td></tr>
            )}
            {loaded && filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-slate-500">
                  <div className="space-y-2">
                    <p>No openings yet.</p>
                    <Link href="/openings/new" className="text-emerald-600 font-medium">Create the first one →</Link>
                  </div>
                </td>
              </tr>
            )}
            {filtered.map(o => {
              const dept = o.department_id ? deptById.get(o.department_id) : null
              const loc  = o.location_id   ? locById.get(o.location_id)    : null
              return (
                <tr key={o.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3">
                    <Link href={`/openings/${o.id}`} className="font-medium text-slate-900 hover:text-emerald-700">
                      {o.title}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <span className={cn('inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize', STATUS_BADGE[o.status])}>
                      {o.status.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{dept?.name ?? '—'}</td>
                  <td className="px-4 py-3 text-slate-600">{loc?.name ?? '—'}</td>
                  <td className="px-4 py-3 text-slate-600">
                    {o.comp_min !== null && o.comp_max !== null
                      ? `${o.comp_currency} ${Number(o.comp_min).toLocaleString()}–${Number(o.comp_max).toLocaleString()}${o.out_of_band ? ' ⚠' : ''}`
                      : '—'}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{o.target_start_date ?? '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
