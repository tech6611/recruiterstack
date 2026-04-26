'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Plus, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import type { Job, JobStatus, Department } from '@/lib/types/requisitions'

type ListItem = Job & { opening_count: number }

const STATUS_OPTIONS: JobStatus[] = ['draft', 'pending_approval', 'approved', 'open', 'closed', 'archived']

const STATUS_BADGE: Record<JobStatus, string> = {
  draft:            'bg-slate-100 text-slate-700',
  pending_approval: 'bg-amber-100 text-amber-800',
  approved:         'bg-emerald-100 text-emerald-800',
  open:             'bg-blue-100 text-blue-800',
  closed:           'bg-slate-200 text-slate-600',
  archived:         'bg-slate-100 text-slate-400',
}

export default function ReqJobsListPage() {
  const [items,  setItems]  = useState<ListItem[]>([])
  const [loaded, setLoaded] = useState(false)
  const [depts,  setDepts]  = useState<Department[]>([])
  const [filters, setFilters] = useState({ status: '', department_id: '', q: '' })

  useEffect(() => {
    fetch('/api/departments').then(r => r.json()).then(({ data }) => setDepts(data ?? []))
  }, [])

  useEffect(() => {
    const params = new URLSearchParams()
    if (filters.status)        params.set('status', filters.status)
    if (filters.department_id) params.set('department_id', filters.department_id)
    fetch(`/api/req-jobs?${params}`)
      .then(r => r.json())
      .then(({ data }) => { setItems(data ?? []); setLoaded(true) })
      .catch(() => setLoaded(true))
  }, [filters.status, filters.department_id])

  const filtered = useMemo(() => {
    const q = filters.q.trim().toLowerCase()
    if (!q) return items
    return items.filter(j => j.title.toLowerCase().includes(q))
  }, [items, filters.q])

  const deptById = useMemo(() => new Map(depts.map(d => [d.id, d])), [depts])

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Job pipelines</h1>
          <p className="text-sm text-slate-500 mt-1">Pipeline containers for approved openings.</p>
        </div>
        <Link href="/req-jobs/new">
          <Button><Plus className="h-4 w-4" /> New pipeline</Button>
        </Link>
      </div>

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
        <Select value={filters.status} onChange={e => setFilters(f => ({ ...f, status: e.target.value }))} className="w-44">
          <option value="">All statuses</option>
          {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
        </Select>
        <Select value={filters.department_id} onChange={e => setFilters(f => ({ ...f, department_id: e.target.value }))} className="w-44">
          <option value="">All departments</option>
          {depts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
        </Select>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
            <tr>
              <th className="text-left px-4 py-3 font-medium">Title</th>
              <th className="text-left px-4 py-3 font-medium">Status</th>
              <th className="text-left px-4 py-3 font-medium">Department</th>
              <th className="text-left px-4 py-3 font-medium">Linked openings</th>
              <th className="text-left px-4 py-3 font-medium">Confidentiality</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {!loaded && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400">Loading…</td></tr>
            )}
            {loaded && filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-slate-500">
                  <div className="space-y-2">
                    <p>No pipelines yet.</p>
                    <Link href="/req-jobs/new" className="text-emerald-600 font-medium">Create the first one →</Link>
                  </div>
                </td>
              </tr>
            )}
            {filtered.map(j => {
              const dept = j.department_id ? deptById.get(j.department_id) : null
              return (
                <tr key={j.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3">
                    <Link href={`/req-jobs/${j.id}`} className="font-medium text-slate-900 hover:text-emerald-700">
                      {j.title}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <span className={cn('inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize', STATUS_BADGE[j.status])}>
                      {j.status.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{dept?.name ?? '—'}</td>
                  <td className="px-4 py-3 text-slate-600">{j.opening_count}</td>
                  <td className="px-4 py-3 text-slate-600 capitalize">{j.confidentiality}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
