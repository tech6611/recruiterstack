'use client'

import Link from 'next/link'
import { useAuth } from '@clerk/nextjs'
import { useCallback, useEffect, useState } from 'react'
import { LifeBuoy, Sparkles } from 'lucide-react'
import { flags } from '@/lib/flags'
import type { HrCase, HrCaseStatus } from '@/lib/types/database'

type Row = HrCase & { requester: { name: string | null; email: string | null } | null }

const STATUS_BADGE: Record<HrCaseStatus, string> = {
  open:         'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
  in_progress:  'bg-slate-50 text-slate-700 ring-1 ring-slate-200',
  resolved:     'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
  closed:       'bg-slate-100 text-slate-500 ring-1 ring-slate-200',
}

export default function HrCasesAdminPage() {
  const { orgId } = useAuth()
  const [cases, setCases] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<HrCaseStatus | 'all'>('all')

  const fetchAll = useCallback(async () => {
    setLoading(true)
    const url = filter === 'all' ? '/api/hris/cases' : `/api/hris/cases?status=${filter}`
    const r = await fetch(url)
    if (r.ok) setCases(((await r.json()).data ?? []) as Row[])
    setLoading(false)
  }, [filter])

  useEffect(() => { if (orgId) fetchAll() }, [fetchAll, orgId])

  if (!flags.hris) return <div className="p-8 text-sm text-slate-500">The HRIS module is not enabled.</div>

  const counts = {
    all:         cases.length,
    open:        cases.filter(c => c.status === 'open').length,
    in_progress: cases.filter(c => c.status === 'in_progress').length,
    resolved:    cases.filter(c => c.status === 'resolved').length,
    closed:      cases.filter(c => c.status === 'closed').length,
  }

  return (
    <div className="p-8">
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50">
          <LifeBuoy className="h-4 w-4 text-emerald-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">HR cases</h1>
          <p className="text-sm text-slate-500">
            Employee questions and issues. The AI takes a first pass on every new case &mdash; ones with
            a <Sparkles className="inline h-3 w-3 text-slate-500" /> AI reply usually self-resolve.
          </p>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="mb-6 flex flex-wrap gap-2">
        {(['all', 'open', 'in_progress', 'resolved', 'closed'] as const).map(f => (
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
              <th className="px-4 py-3">Subject</th>
              <th className="px-4 py-3">Requester</th>
              <th className="px-4 py-3">Category</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">AI</th>
              <th className="px-4 py-3">Created</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-400">Loading…</td></tr>
            ) : cases.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-400">No cases yet.</td></tr>
            ) : cases.map(c => (
              <tr
                key={c.id}
                onClick={() => location.assign(`/hris/cases/${c.id}`)}
                className="cursor-pointer border-b border-slate-100 last:border-0 hover:bg-slate-50"
              >
                <td className="px-4 py-3">
                  <Link href={`/hris/cases/${c.id}`} className="font-medium text-slate-900 hover:text-emerald-700">
                    {c.subject}
                  </Link>
                </td>
                <td className="px-4 py-3">
                  <div className="text-slate-700">{c.requester?.name ?? '—'}</div>
                  <div className="text-xs text-slate-400">{c.requester?.email ?? ''}</div>
                </td>
                <td className="px-4 py-3 capitalize text-slate-600">{c.category}</td>
                <td className="px-4 py-3">
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[c.status]}`}>
                    {c.status.replace('_', ' ')}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {c.ai_attempted_at && (
                    <span title="AI took a first pass" className="inline-flex">
                      <Sparkles className="h-4 w-4 text-slate-500" />
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-slate-500">{new Date(c.created_at).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
