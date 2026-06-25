'use client'

import { useAuth } from '@clerk/nextjs'
import { useCallback, useEffect, useState } from 'react'
import { Calendar } from 'lucide-react'
import { flags } from '@/lib/flags'
import { inputCls, labelCls } from '@/lib/ui/styles'
import type { TimeOffRequest, TimeOffRequestType, TimeOffStatus } from '@/lib/types/database'

type BalanceByType = Record<TimeOffRequestType, { granted: number; used: number; pending: number; available: number }>

const TYPE_TONE: Record<TimeOffRequestType, string> = {
  vacation: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
  sick:     'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
  personal: 'bg-slate-50 text-slate-700 ring-1 ring-slate-200',
  unpaid:   'bg-slate-100 text-slate-600 ring-1 ring-slate-200',
}

const TYPE_LABEL: Record<TimeOffRequestType, string> = {
  vacation: 'Vacation',
  sick:     'Sick',
  personal: 'Personal',
  unpaid:   'Unpaid',
}

const STATUS_BADGE: Record<TimeOffStatus, string> = {
  pending:    'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
  approved:   'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
  rejected:   'bg-rose-50 text-rose-700 ring-1 ring-rose-200',
  cancelled:  'bg-slate-100 text-slate-500 ring-1 ring-slate-200',
}

export default function MyTimeOffPage() {
  const { orgId } = useAuth()
  const [requests, setRequests] = useState<TimeOffRequest[]>([])
  const [balance, setBalance]   = useState<BalanceByType | null>(null)
  const [loading, setLoading]   = useState(true)
  const [hasEmployee, setHasEmployee] = useState(true)

  const [type, setType]     = useState<TimeOffRequestType>('vacation')
  const [start, setStart]   = useState('')
  const [end, setEnd]       = useState('')
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError]   = useState<string | null>(null)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    const meRes = await fetch('/api/me')
    if (meRes.ok) {
      const j = await meRes.json()
      setHasEmployee(Boolean(j.data?.employee))
    }
    const [reqRes, balRes] = await Promise.all([
      fetch('/api/me/time-off'),
      fetch('/api/me/leave-balance'),
    ])
    if (reqRes.ok) {
      const j = await reqRes.json()
      setRequests((j.data ?? []) as TimeOffRequest[])
    }
    if (balRes.ok) {
      const j = await balRes.json()
      setBalance((j.data?.by_type ?? null) as BalanceByType | null)
    }
    setLoading(false)
  }, [])

  useEffect(() => { if (orgId) fetchAll() }, [fetchAll, orgId])

  async function submit() {
    if (!start || !end) return
    setSubmitting(true); setError(null)
    const res = await fetch('/api/me/time-off', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ request_type: type, start_date: start, end_date: end, reason: reason || null }),
    })
    if (res.ok) {
      setStart(''); setEnd(''); setReason(''); setType('vacation')
      await fetchAll()
    } else {
      const j = await res.json().catch(() => ({}))
      setError(j.error ?? 'Failed to submit')
    }
    setSubmitting(false)
  }

  if (!flags.hris) return <div className="p-8 text-sm text-slate-500">The HRIS module is not enabled.</div>

  return (
    <div className="p-8">
      <h1 className="mb-1 text-2xl font-bold tracking-tight text-slate-900">Your time off</h1>
      <p className="mb-6 text-sm text-slate-500">
        Submit a request — it routes to your manager automatically.
      </p>

      {!hasEmployee ? (
        <div className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-400">
          You&rsquo;re not linked to an employee record in this org yet. Ask HR to add you.
        </div>
      ) : (
        <>
          {/* Balance tiles */}
          {balance && (
            <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {(['vacation', 'sick', 'personal', 'unpaid'] as TimeOffRequestType[]).map(t => {
                const b = balance[t]
                const pct = b.granted > 0 ? Math.round(((b.granted - b.used - b.pending) / b.granted) * 100) : 0
                return (
                  <div key={t} className="rounded-xl border border-slate-200 bg-white p-4">
                    <div className="flex items-center justify-between">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${TYPE_TONE[t]}`}>{TYPE_LABEL[t]}</span>
                      {b.pending > 0 && <span className="text-[10px] text-amber-600">{b.pending} pending</span>}
                    </div>
                    <p className="mt-2 text-2xl font-bold text-slate-900">{b.available}<span className="ml-1 text-sm font-normal text-slate-400">/ {b.granted}</span></p>
                    <p className="text-xs text-slate-500">{b.used} used · days remaining</p>
                    {b.granted > 0 && (
                      <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-slate-100">
                        <div className="h-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* Request form */}
          <div className="mb-6 rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="mb-4 text-sm font-semibold text-slate-900">Request time off</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div>
                <label className={labelCls}>Type</label>
                <select className={inputCls} value={type} onChange={e => setType(e.target.value as TimeOffRequestType)}>
                  <option value="vacation">Vacation</option>
                  <option value="sick">Sick</option>
                  <option value="personal">Personal</option>
                  <option value="unpaid">Unpaid</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>Start</label>
                <input type="date" className={inputCls} value={start} onChange={e => setStart(e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>End</label>
                <input type="date" className={inputCls} value={end} onChange={e => setEnd(e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>Reason (optional)</label>
                <input className={inputCls} value={reason} onChange={e => setReason(e.target.value)} placeholder="Family event" />
              </div>
            </div>
            {error && <p className="mt-3 text-xs text-rose-600">{error}</p>}
            <div className="mt-3 flex justify-end">
              <button
                onClick={submit}
                disabled={!start || !end || submitting}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#221b14] px-3 py-2 text-sm font-semibold text-white hover:bg-[#33271b] disabled:opacity-50"
              >
                <Calendar className="h-4 w-4" />
                {submitting ? 'Submitting…' : 'Submit request'}
              </button>
            </div>
          </div>

          {/* List */}
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="mb-4 text-sm font-semibold text-slate-900">Your requests</h2>
            {loading ? (
              <p className="py-2 text-sm text-slate-400">Loading…</p>
            ) : requests.length === 0 ? (
              <p className="py-2 text-sm text-slate-400">No requests yet.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {requests.map(r => (
                  <li key={r.id} className="flex items-center gap-3 px-2 py-2 text-sm">
                    <span className="min-w-0 flex-1">
                      <span className="font-medium text-slate-800 capitalize">{r.request_type}</span>
                      <span className="ml-2 text-slate-500">
                        {r.start_date === r.end_date ? r.start_date : `${r.start_date} → ${r.end_date}`}
                      </span>
                      {r.reason && <span className="ml-2 text-xs text-slate-400">— {r.reason}</span>}
                    </span>
                    <span className={`inline-flex shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[r.status]}`}>
                      {r.status}
                    </span>
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
