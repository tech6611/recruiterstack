'use client'

import { useAuth } from '@clerk/nextjs'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { UserCog, BadgeCheck, Clock, LogOut } from 'lucide-react'
import { flags } from '@/lib/flags'
import type { EmployeeStatus } from '@/lib/types/database'

type EmployeeRow = {
  id: string
  person_id: string
  status: EmployeeStatus
  hired_at: string | null
  start_date: string | null
  joined_at: string | null
  terminated_at: string | null
  person: { name: string; email: string } | null
}

const STATUS_BADGE: Record<EmployeeStatus, string> = {
  pending:    'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
  active:     'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
  terminated: 'bg-slate-100 text-slate-500 ring-1 ring-slate-200',
}

const STATUS_LABEL: Record<EmployeeStatus, string> = {
  pending:    'Pre-hire',
  active:     'Active',
  terminated: 'Terminated',
}

function fmt(date: string | null): string {
  if (!date) return '—'
  return new Date(date).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

export default function EmployeesPage() {
  const { orgId } = useAuth()
  const router    = useRouter()
  const [employees, setEmployees] = useState<EmployeeRow[]>([])
  const [loading, setLoading]     = useState(true)
  const [filter, setFilter]       = useState<EmployeeStatus | 'all'>('all')
  const [busyId, setBusyId]       = useState<string | null>(null)

  const fetchEmployees = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/employees')
    if (res.ok) {
      const json = await res.json()
      setEmployees((json.data ?? []) as EmployeeRow[])
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    if (orgId) fetchEmployees()
  }, [fetchEmployees, orgId])

  const counts = useMemo(() => ({
    total:      employees.length,
    pending:    employees.filter(e => e.status === 'pending').length,
    active:     employees.filter(e => e.status === 'active').length,
    terminated: employees.filter(e => e.status === 'terminated').length,
  }), [employees])

  const visible = useMemo(
    () => (filter === 'all' ? employees : employees.filter(e => e.status === filter)),
    [employees, filter],
  )

  async function markJoined(id: string) {
    setBusyId(id)
    const res = await fetch(`/api/employees/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'join' }),
    })
    if (res.ok) await fetchEmployees()
    setBusyId(null)
  }

  if (!flags.hris) {
    return (
      <div className="p-8 text-sm text-slate-500">The HRIS module is not enabled.</div>
    )
  }

  const STATS: { key: EmployeeStatus | 'all'; label: string; value: number; icon: typeof UserCog; tone: string }[] = [
    { key: 'all',        label: 'All employees', value: counts.total,      icon: UserCog,    tone: 'text-slate-500' },
    { key: 'pending',    label: 'Pre-hire',      value: counts.pending,    icon: Clock,      tone: 'text-amber-500' },
    { key: 'active',     label: 'Active',        value: counts.active,     icon: BadgeCheck, tone: 'text-emerald-500' },
    { key: 'terminated', label: 'Terminated',    value: counts.terminated, icon: LogOut,     tone: 'text-slate-400' },
  ]

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Employees</h1>
        <p className="mt-1 text-sm text-slate-500">
          People who moved from candidate to employee. Pre-hires have accepted an offer; mark them
          joined when they start.
        </p>
      </div>

      {/* Stat cards (clickable filters) */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {STATS.map(({ key, label, value, icon: Icon, tone }) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={`rounded-xl border bg-white p-4 text-left transition-all hover:border-emerald-300 ${
              filter === key ? 'border-emerald-400 ring-2 ring-emerald-100' : 'border-slate-200'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500">{label}</span>
              <Icon className={`h-4 w-4 ${tone}`} />
            </div>
            <p className="mt-2 text-2xl font-bold text-slate-900">{value}</p>
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold text-slate-500">
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Hired</th>
              <th className="px-4 py-3">Start date</th>
              <th className="px-4 py-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="px-4 py-10 text-center text-slate-400">Loading…</td></tr>
            ) : visible.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-10 text-center text-slate-400">
                No employees{filter !== 'all' ? ` with status "${STATUS_LABEL[filter as EmployeeStatus]}"` : ''} yet.
              </td></tr>
            ) : (
              visible.map(emp => (
                <tr
                  key={emp.id}
                  onClick={() => router.push(`/hris/employees/${emp.id}`)}
                  className="cursor-pointer border-b border-slate-100 last:border-0 hover:bg-slate-50"
                >
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-900">{emp.person?.name ?? 'Unknown'}</div>
                    <div className="text-xs text-slate-400">{emp.person?.email ?? '—'}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[emp.status]}`}>
                      {STATUS_LABEL[emp.status]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{fmt(emp.hired_at)}</td>
                  <td className="px-4 py-3 text-slate-600">{fmt(emp.start_date)}</td>
                  <td className="px-4 py-3 text-right" onClick={e => e.stopPropagation()}>
                    {emp.status === 'pending' ? (
                      <button
                        onClick={() => markJoined(emp.id)}
                        disabled={busyId === emp.id}
                        className="rounded-lg bg-[#221b14] px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-[#33271b] disabled:opacity-50"
                      >
                        {busyId === emp.id ? 'Saving…' : 'Mark joined'}
                      </button>
                    ) : emp.status === 'active' ? (
                      <span className="text-xs text-slate-400">Joined {fmt(emp.joined_at)}</span>
                    ) : (
                      <span className="text-xs text-slate-400">—</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
