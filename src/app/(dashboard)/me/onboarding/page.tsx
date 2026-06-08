'use client'

import { useAuth } from '@clerk/nextjs'
import { useCallback, useEffect, useState } from 'react'
import { ClipboardCheck } from 'lucide-react'
import { flags } from '@/lib/flags'
import type { OnboardingPlan, OnboardingTask } from '@/lib/types/database'

export default function MyOnboardingPage() {
  const { orgId } = useAuth()
  const [plan, setPlan] = useState<OnboardingPlan | null>(null)
  const [tasks, setTasks] = useState<OnboardingTask[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/me/onboarding')
    if (res.ok) {
      const j = await res.json()
      setPlan((j.data?.plan ?? null) as OnboardingPlan | null)
      setTasks((j.data?.tasks ?? []) as OnboardingTask[])
    }
    setLoading(false)
  }, [])

  useEffect(() => { if (orgId) fetchAll() }, [fetchAll, orgId])

  async function complete(id: string) {
    setBusyId(id)
    const res = await fetch(`/api/hris/onboarding/tasks/${id}`, { method: 'PATCH' })
    if (res.ok) await fetchAll()
    setBusyId(null)
  }

  if (!flags.hris) return <div className="p-8 text-sm text-slate-500">The HRIS module is not enabled.</div>

  const done = tasks.filter(t => t.status === 'completed').length
  const pct  = tasks.length > 0 ? Math.round((done / tasks.length) * 100) : 0

  return (
    <div className="p-8">
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50">
          <ClipboardCheck className="h-4 w-4 text-emerald-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Your onboarding</h1>
          <p className="text-sm text-slate-500">
            {plan
              ? <>Plan: <span className="font-medium text-slate-700">{plan.template_name}</span> · starts {plan.start_date}</>
              : 'You don\'t have an active onboarding plan.'}
          </p>
        </div>
      </div>

      {loading ? (
        <div className="text-sm text-slate-400">Loading…</div>
      ) : !plan ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-400">
          No onboarding plan assigned. Ask HR if you should have one.
        </div>
      ) : (
        <>
          {/* Progress bar */}
          <div className="mb-6 rounded-xl border border-slate-200 bg-white p-5">
            <div className="mb-2 flex items-baseline justify-between">
              <p className="text-sm font-semibold text-slate-900">Progress</p>
              <p className="text-xs text-slate-500">{done} of {tasks.length} done · {pct}%</p>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
              <div className="h-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
            </div>
          </div>

          {/* Tasks */}
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="mb-3 text-sm font-semibold text-slate-900">Your tasks</h2>
            {tasks.length === 0 ? (
              <p className="py-2 text-sm text-slate-400">No tasks assigned to you.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {tasks.map(t => (
                  <li key={t.id} className="flex items-start gap-3 py-3">
                    <button
                      onClick={() => t.status === 'pending' && complete(t.id)}
                      disabled={t.status === 'completed' || busyId === t.id}
                      aria-label={t.status === 'completed' ? 'Completed' : 'Mark complete'}
                      className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors ${
                        t.status === 'completed'
                          ? 'border-emerald-500 bg-emerald-500 text-white'
                          : 'border-slate-300 hover:border-emerald-400 hover:bg-emerald-50'
                      } disabled:opacity-60`}
                    >
                      {t.status === 'completed' && <span className="text-xs font-bold">✓</span>}
                    </button>
                    <div className="min-w-0 flex-1">
                      <p className={`text-sm font-medium ${t.status === 'completed' ? 'text-slate-400 line-through' : 'text-slate-900'}`}>
                        {t.title}
                      </p>
                      {t.description && (
                        <p className={`mt-0.5 text-xs ${t.status === 'completed' ? 'text-slate-300' : 'text-slate-500'}`}>
                          {t.description}
                        </p>
                      )}
                    </div>
                    {t.due_date && (
                      <span className="shrink-0 text-xs text-slate-400">due {t.due_date}</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  )
}
