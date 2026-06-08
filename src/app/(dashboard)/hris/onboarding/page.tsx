'use client'

import Link from 'next/link'
import { useAuth } from '@clerk/nextjs'
import { useCallback, useEffect, useState } from 'react'
import { ClipboardCheck } from 'lucide-react'
import { flags } from '@/lib/flags'
import type { OnboardingPlan, OnboardingPlanStatus } from '@/lib/types/database'

type Row = OnboardingPlan & { total_tasks: number; completed_tasks: number }
type EmpInfo = { id: string; person: { name: string; email: string } | null }

const STATUS_BADGE: Record<OnboardingPlanStatus, string> = {
  in_progress: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
  completed:   'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
  cancelled:   'bg-slate-100 text-slate-500 ring-1 ring-slate-200',
}

export default function OnboardingAdminPage() {
  const { orgId } = useAuth()
  const [plans, setPlans] = useState<Row[]>([])
  const [employees, setEmployees] = useState<Map<string, EmpInfo>>(new Map())
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<OnboardingPlanStatus | 'all'>('all')

  const fetchAll = useCallback(async () => {
    setLoading(true)
    const url = filter === 'all' ? '/api/hris/onboarding/plans' : `/api/hris/onboarding/plans?status=${filter}`
    const [plansRes, empsRes] = await Promise.all([
      fetch(url),
      fetch('/api/employees'),
    ])
    if (plansRes.ok) {
      const j = await plansRes.json()
      setPlans((j.data ?? []) as Row[])
    }
    if (empsRes.ok) {
      const j = await empsRes.json()
      const map = new Map<string, EmpInfo>()
      for (const e of (j.data ?? []) as EmpInfo[]) map.set(e.id, e)
      setEmployees(map)
    }
    setLoading(false)
  }, [filter])

  useEffect(() => { if (orgId) fetchAll() }, [fetchAll, orgId])

  if (!flags.hris) return <div className="p-8 text-sm text-slate-500">The HRIS module is not enabled.</div>

  const counts = {
    all:         plans.length,
    in_progress: plans.filter(p => p.status === 'in_progress').length,
    completed:   plans.filter(p => p.status === 'completed').length,
    cancelled:   plans.filter(p => p.status === 'cancelled').length,
  }

  return (
    <div className="p-8">
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50">
          <ClipboardCheck className="h-4 w-4 text-emerald-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Onboarding</h1>
          <p className="text-sm text-slate-500">All onboarding plans across the org. Start a new one from any employee&rsquo;s detail page.</p>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="mb-6 flex gap-2">
        {(['all', 'in_progress', 'completed', 'cancelled'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-all ${
              filter === f
                ? 'border-emerald-400 bg-emerald-50 text-emerald-700'
                : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
            }`}
          >
            {f === 'all' ? 'All' : f.replace('_', ' ')} ({counts[f]})
          </button>
        ))}
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold text-slate-500">
              <th className="px-4 py-3">Employee</th>
              <th className="px-4 py-3">Template</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Progress</th>
              <th className="px-4 py-3">Started</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="px-4 py-10 text-center text-slate-400">Loading…</td></tr>
            ) : plans.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-10 text-center text-slate-400">No onboarding plans yet.</td></tr>
            ) : plans.map(p => {
              const emp = employees.get(p.employee_id)
              const pct = p.total_tasks > 0 ? Math.round((p.completed_tasks / p.total_tasks) * 100) : 0
              return (
                <tr key={p.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <Link href={`/hris/employees/${p.employee_id}`} className="font-medium text-slate-900 hover:text-emerald-700">
                      {emp?.person?.name ?? 'Unknown'}
                    </Link>
                    <div className="text-xs text-slate-400">{emp?.person?.email ?? ''}</div>
                  </td>
                  <td className="px-4 py-3 text-slate-700">{p.template_name}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[p.status]}`}>
                      {p.status.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-100">
                        <div className="h-full bg-emerald-500" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-xs text-slate-500">{p.completed_tasks}/{p.total_tasks}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{p.start_date}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
