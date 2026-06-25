'use client'

import Link from 'next/link'
import { useAuth } from '@clerk/nextjs'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Target } from 'lucide-react'
import { flags } from '@/lib/flags'
import type { EmployeeStatus, Okr, OkrStatus } from '@/lib/types/database'

type Row = Okr & { computed_progress: number; key_result_count: number }
type EmpInfo = { id: string; status: EmployeeStatus; person: { name: string; email: string } | null }

const STATUS_BADGE: Record<OkrStatus, string> = {
  draft:     'bg-slate-100 text-slate-600 ring-1 ring-slate-200',
  active:    'bg-slate-50 text-slate-700 ring-1 ring-slate-200',
  achieved:  'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
  missed:    'bg-rose-50 text-rose-700 ring-1 ring-rose-200',
  abandoned: 'bg-slate-100 text-slate-500 ring-1 ring-slate-200',
}

function defaultCycle(): string {
  const d = new Date()
  const q = Math.floor(d.getUTCMonth() / 3) + 1
  return `${d.getUTCFullYear()}-Q${q}`
}

export default function HrisOkrsAdminPage() {
  const { orgId } = useAuth()
  const [rows, setRows] = useState<Row[]>([])
  const [employees, setEmployees] = useState<Map<string, EmpInfo>>(new Map())
  const [loading, setLoading] = useState(true)
  const [cycle, setCycle] = useState<string>(defaultCycle())

  const fetchAll = useCallback(async () => {
    setLoading(true)
    const [oRes, eRes] = await Promise.all([
      fetch(`/api/hris/okrs${cycle ? `?cycle=${encodeURIComponent(cycle)}` : ''}`),
      fetch('/api/employees'),
    ])
    if (oRes.ok) setRows(((await oRes.json()).data ?? []) as Row[])
    if (eRes.ok) {
      const j = await eRes.json()
      const m = new Map<string, EmpInfo>()
      for (const e of (j.data ?? []) as EmpInfo[]) m.set(e.id, e)
      setEmployees(m)
    }
    setLoading(false)
  }, [cycle])

  useEffect(() => { if (orgId) fetchAll() }, [fetchAll, orgId])

  // Group by employee for the overview.
  const byEmployee = useMemo(() => {
    const m = new Map<string, Row[]>()
    for (const r of rows) {
      const arr = m.get(r.owner_employee_id) ?? []
      arr.push(r); m.set(r.owner_employee_id, arr)
    }
    return m
  }, [rows])

  if (!flags.hris) return <div className="p-8 text-sm text-slate-500">The HRIS module is not enabled.</div>

  return (
    <div className="p-8">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50">
            <Target className="h-4 w-4 text-emerald-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">OKRs</h1>
            <p className="text-sm text-slate-500">Org-wide objectives across employees for the selected cycle.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs font-semibold text-slate-500">Cycle:</label>
          <input
            value={cycle}
            onChange={e => setCycle(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm"
            placeholder="2026-Q3"
          />
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold text-slate-500">
              <th className="px-4 py-3">Employee</th>
              <th className="px-4 py-3">Objective</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Progress</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={4} className="px-4 py-10 text-center text-slate-400">Loading…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={4} className="px-4 py-10 text-center text-slate-400">No OKRs for cycle &ldquo;{cycle}&rdquo;.</td></tr>
            ) : (
              Array.from(byEmployee.entries()).flatMap(([empId, list]) =>
                list.map((r, idx) => {
                  const emp = employees.get(empId)
                  return (
                    <tr key={r.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                      <td className="px-4 py-3 align-top">
                        {idx === 0 ? (
                          <Link href={`/hris/employees/${empId}`} className="font-medium text-slate-900 hover:text-emerald-700">
                            {emp?.person?.name ?? 'Unknown'}
                          </Link>
                        ) : (
                          <span className="text-xs text-slate-300">↳</span>
                        )}
                        {idx === 0 && <div className="text-xs text-slate-400">{emp?.person?.email ?? ''}</div>}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-800">{r.title}</div>
                        {r.description && <div className="text-xs text-slate-400">{r.description}</div>}
                        <div className="mt-0.5 text-xs text-slate-400">{r.key_result_count} KR{r.key_result_count === 1 ? '' : 's'}</div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[r.status]}`}>{r.status}</span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-100">
                            <div className="h-full bg-emerald-500" style={{ width: `${r.computed_progress}%` }} />
                          </div>
                          <span className="text-xs text-slate-500">{r.computed_progress}%</span>
                        </div>
                      </td>
                    </tr>
                  )
                }),
              )
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
