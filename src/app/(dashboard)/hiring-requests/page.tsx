'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Plus, Loader2, Clock, Mail, CheckCircle, FileText, Send,
  ChevronUp, ChevronDown, ChevronsUpDown, Search, X,
} from 'lucide-react'
import type { HiringRequest, HiringRequestStatus } from '@/lib/types/database'

const STATUS_CONFIG: Record<HiringRequestStatus, { label: string; color: string; icon: React.ReactNode }> = {
  intake_pending:   { label: 'Awaiting HM',       color: 'bg-amber-50 text-amber-700 border-amber-200',    icon: <Clock className="h-3 w-3" /> },
  intake_submitted: { label: 'Intake Received',   color: 'bg-blue-50 text-blue-700 border-blue-200',       icon: <FileText className="h-3 w-3" /> },
  jd_generated:    { label: 'JD Generated',       color: 'bg-violet-50 text-violet-700 border-violet-200', icon: <FileText className="h-3 w-3" /> },
  jd_sent:         { label: 'JD Sent',            color: 'bg-indigo-50 text-indigo-700 border-indigo-200', icon: <Mail className="h-3 w-3" /> },
  jd_approved:     { label: 'JD Ready — Review',  color: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: <CheckCircle className="h-3 w-3" /> },
  posted:          { label: 'Posted',             color: 'bg-slate-100 text-slate-600 border-slate-200',   icon: <Send className="h-3 w-3" /> },
}

type SortKey = 'ticket_number' | 'position_title' | 'hiring_manager_name' | 'status' | 'created_at'

export default function HiringRequestsPage() {
  const router = useRouter()
  const [requests, setRequests] = useState<HiringRequest[]>([])
  const [loading, setLoading] = useState(true)

  const [sortKey, setSortKey] = useState<SortKey>('created_at')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [filterStatus, setFilterStatus] = useState<HiringRequestStatus | 'all'>('all')
  const [search, setSearch] = useState('')

  useEffect(() => {
    fetch('/api/hiring-requests')
      .then(r => r.json())
      .then(d => { setRequests(d.data ?? []); setLoading(false) })
  }, [])

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <ChevronsUpDown className="h-3 w-3 text-slate-300 ml-1" />
    return sortDir === 'asc'
      ? <ChevronUp className="h-3 w-3 text-blue-500 ml-1" />
      : <ChevronDown className="h-3 w-3 text-blue-500 ml-1" />
  }

  const counts = useMemo(() => ({
    total: requests.length,
    awaiting: requests.filter(r => r.status === 'intake_pending').length,
    ready: requests.filter(r => r.status === 'jd_approved').length,
    posted: requests.filter(r => r.status === 'posted').length,
  }), [requests])

  const filtered = useMemo(() => {
    let result = [...requests]
    if (filterStatus !== 'all') result = result.filter(r => r.status === filterStatus)
    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter(r =>
        r.position_title.toLowerCase().includes(q) ||
        r.hiring_manager_name.toLowerCase().includes(q) ||
        r.ticket_number?.toLowerCase().includes(q) ||
        r.department?.toLowerCase().includes(q)
      )
    }
    result.sort((a, b) => {
      const vA = String((a as any)[sortKey] ?? '')
      const vB = String((b as any)[sortKey] ?? '')
      const cmp = vA.localeCompare(vB, undefined, { numeric: true })
      return sortDir === 'asc' ? cmp : -cmp
    })
    return result
  }, [requests, filterStatus, search, sortKey, sortDir])

  const thCls = 'px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide select-none cursor-pointer hover:text-slate-800 transition-colors'

  return (
    <div className="p-8 max-w-5xl space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Hiring Requests</h1>
          <p className="text-sm text-slate-500 mt-0.5">All open and closed positions in one place</p>
        </div>
        <Link
          href="/hiring-requests/new"
          className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 transition-colors shadow-sm"
        >
          <Plus className="h-4 w-4" />
          New Request
        </Link>
      </div>

      {/* Totals bar */}
      {!loading && (
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: 'Total', value: counts.total, color: 'bg-slate-50 border-slate-200 text-slate-700' },
            { label: 'Awaiting HM', value: counts.awaiting, color: 'bg-amber-50 border-amber-200 text-amber-700' },
            { label: 'JD Ready', value: counts.ready, color: 'bg-emerald-50 border-emerald-200 text-emerald-700' },
            { label: 'Posted', value: counts.posted, color: 'bg-blue-50 border-blue-200 text-blue-700' },
          ].map(stat => (
            <div key={stat.label} className={`rounded-xl border p-3.5 ${stat.color}`}>
              <p className="text-2xl font-bold">{stat.value}</p>
              <p className="text-xs font-medium mt-0.5 opacity-70">{stat.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search position, manager, ticket…"
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
          onChange={e => setFilterStatus(e.target.value as HiringRequestStatus | 'all')}
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition"
        >
          <option value="all">All statuses</option>
          {(Object.keys(STATUS_CONFIG) as HiringRequestStatus[]).map(s => (
            <option key={s} value={s}>{STATUS_CONFIG[s].label}</option>
          ))}
        </select>
        {(filterStatus !== 'all' || search) && (
          <button
            onClick={() => { setFilterStatus('all'); setSearch('') }}
            className="text-xs text-slate-500 hover:text-slate-800 transition-colors"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-slate-300" />
        </div>
      ) : requests.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 py-16 text-center">
          <FileText className="h-10 w-10 text-slate-200 mx-auto mb-3" />
          <p className="text-sm font-medium text-slate-500">No hiring requests yet</p>
          <p className="text-xs text-slate-400 mt-1 mb-4">Create your first request to get started</p>
          <Link
            href="/hiring-requests/new"
            className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            New Request
          </Link>
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                <th className={thCls} onClick={() => toggleSort('ticket_number')}>
                  <span className="flex items-center"># <SortIcon col="ticket_number" /></span>
                </th>
                <th className={thCls} onClick={() => toggleSort('position_title')}>
                  <span className="flex items-center">Position <SortIcon col="position_title" /></span>
                </th>
                <th className={thCls} onClick={() => toggleSort('hiring_manager_name')}>
                  <span className="flex items-center">Hiring Manager <SortIcon col="hiring_manager_name" /></span>
                </th>
                <th className={thCls} onClick={() => toggleSort('status')}>
                  <span className="flex items-center">Status <SortIcon col="status" /></span>
                </th>
                <th className={thCls} onClick={() => toggleSort('created_at')}>
                  <span className="flex items-center">Created <SortIcon col="created_at" /></span>
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-10 text-center text-sm text-slate-400">
                    No results match your filters.
                  </td>
                </tr>
              ) : filtered.map(r => {
                const s = STATUS_CONFIG[r.status]
                return (
                  <tr
                    key={r.id}
                    onClick={() => router.push(`/hiring-requests/${r.id}`)}
                    className="border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors cursor-pointer"
                  >
                    <td className="px-4 py-3.5">
                      <span className="text-xs font-mono font-semibold text-slate-400">
                        {r.ticket_number ?? '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3.5">
                      <p className="font-semibold text-sm text-slate-900">{r.position_title}</p>
                      {r.department && <p className="text-xs text-slate-400 mt-0.5">{r.department}</p>}
                    </td>
                    <td className="px-4 py-3.5">
                      <p className="text-sm text-slate-700">{r.hiring_manager_name}</p>
                      {r.hiring_manager_email && (
                        <p className="text-xs text-slate-400">{r.hiring_manager_email}</p>
                      )}
                    </td>
                    <td className="px-4 py-3.5">
                      <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${s.color}`}>
                        {s.icon}{s.label}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-xs text-slate-400">
                      {new Date(r.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {filtered.length > 0 && (
            <div className="px-4 py-2.5 border-t border-slate-100 bg-slate-50">
              <p className="text-xs text-slate-400">
                Showing {filtered.length} of {requests.length} request{requests.length !== 1 ? 's' : ''}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
