'use client'

import { useAuth } from '@clerk/nextjs'
import { useCallback, useEffect, useState } from 'react'
import { Inbox } from 'lucide-react'
import { flags } from '@/lib/flags'
import type { TimeOffRequest } from '@/lib/types/database'

type PendingDecision = {
  request: TimeOffRequest
  requester: { name: string | null; email: string | null } | null
  employee_id: string
}

export default function MyApprovalsPage() {
  const { orgId } = useAuth()
  const [items, setItems] = useState<PendingDecision[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/me/approvals-pending')
    if (res.ok) {
      const j = await res.json()
      setItems((j.data ?? []) as PendingDecision[])
    }
    setLoading(false)
  }, [])

  useEffect(() => { if (orgId) fetchAll() }, [fetchAll, orgId])

  async function decide(requestId: string, action: 'approve' | 'reject') {
    setBusyId(requestId)
    const res = await fetch(`/api/time-off/${requestId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    })
    if (res.ok) await fetchAll()
    setBusyId(null)
  }

  if (!flags.hris) return <div className="p-8 text-sm text-slate-500">The HRIS module is not enabled.</div>

  return (
    <div className="p-8">
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-50">
          <Inbox className="h-4 w-4 text-amber-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Waiting on you</h1>
          <p className="text-sm text-slate-500">Time-off requests from your direct reports.</p>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5">
        {loading ? (
          <p className="py-2 text-sm text-slate-400">Loading…</p>
        ) : items.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-400">Nothing waiting on you. 🎉</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {items.map(p => {
              const r = p.request
              const range = r.start_date === r.end_date ? r.start_date : `${r.start_date} → ${r.end_date}`
              return (
                <li key={r.id} className="flex items-center gap-3 px-2 py-3 text-sm">
                  <span className="min-w-0 flex-1">
                    <span className="font-medium text-slate-900">{p.requester?.name ?? '—'}</span>
                    <span className="ml-2 text-slate-500 capitalize">{r.request_type}</span>
                    <span className="ml-2 text-slate-500">{range}</span>
                    {r.reason && <span className="ml-2 text-xs text-slate-400">— {r.reason}</span>}
                  </span>
                  <span className="flex shrink-0 gap-1">
                    <button
                      onClick={() => decide(r.id, 'approve')}
                      disabled={busyId === r.id}
                      className="rounded-md bg-[#221b14] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#33271b] disabled:opacity-50"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => decide(r.id, 'reject')}
                      disabled={busyId === r.id}
                      className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                    >
                      Reject
                    </button>
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
