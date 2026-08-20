'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Unlock, ArrowLeft, Users, CheckCircle2 } from 'lucide-react'

interface Usage {
  access: { tier: string; quota: number | null; used: number; remaining: number | null; active: boolean; expires_at: string | null } | null
  unlocks: { profile_id: string; candidate_id: string | null; unlocked_at: string; name: string; title: string | null; in_pipeline: boolean }[]
  total_unlocks: number
}

function when(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function PoolUsagePage() {
  const [u, setU] = useState<Usage | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/pool/usage')
      .then((r) => (r.ok ? r.json() : { data: null }))
      .then((j) => setU(j.data ?? null))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const a = u?.access
  const pct = a && a.quota != null && a.quota > 0 ? Math.min(100, Math.round((a.used / a.quota) * 100)) : 0

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <Link href="/pool" className="mb-4 inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700">
        <ArrowLeft className="h-3.5 w-3.5" /> Candidate Pool
      </Link>
      <h1 className="flex items-center gap-2 text-xl font-bold text-slate-900">
        <Unlock className="h-5 w-5 text-sky-600" /> Pool usage
      </h1>
      <p className="mt-1 text-sm text-slate-500">Your Candidate Pool subscription, unlocks spent, and who you&rsquo;ve unlocked.</p>

      {loading && <p className="mt-8 text-sm text-slate-400">Loading…</p>}

      {!loading && !a && (
        <div className="mt-8 rounded-xl border border-dashed border-slate-300 p-8 text-center">
          <p className="text-sm text-slate-500">No Candidate Pool subscription yet. Start a trial from a job&rsquo;s Source tab → &ldquo;From the market.&rdquo;</p>
        </div>
      )}

      {!loading && a && (
        <>
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="text-[11px] uppercase tracking-wide text-slate-400">Plan</div>
              <div className="mt-1 text-lg font-bold capitalize text-slate-800">{a.tier}</div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="text-[11px] uppercase tracking-wide text-slate-400">Unlocks used</div>
              <div className="mt-1 text-lg font-bold text-slate-800">{a.used}{a.quota != null && <span className="text-sm font-normal text-slate-400"> / {a.quota}</span>}</div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="text-[11px] uppercase tracking-wide text-slate-400">Remaining</div>
              <div className="mt-1 text-lg font-bold text-slate-800">{a.remaining == null ? 'Unlimited' : a.remaining}</div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="text-[11px] uppercase tracking-wide text-slate-400">Added to pipeline</div>
              <div className="mt-1 flex items-center gap-1 text-lg font-bold text-slate-800"><CheckCircle2 className="h-4 w-4 text-emerald-500" />{u!.unlocks.filter((x) => x.in_pipeline).length}</div>
            </div>
          </div>

          {a.quota != null && (
            <div className="mt-4">
              <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                <div className={`h-full rounded-full ${pct >= 90 ? 'bg-rose-500' : pct >= 70 ? 'bg-amber-500' : 'bg-sky-500'}`} style={{ width: `${pct}%` }} />
              </div>
              <div className="mt-1 text-[11px] text-slate-400">{pct}% of your unlock quota used{a.expires_at ? ` · renews ${when(a.expires_at)}` : ''}</div>
            </div>
          )}

          <div className="mt-8">
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-700"><Users className="h-4 w-4 text-slate-400" /> Unlock history ({u!.total_unlocks})</div>
            {u!.unlocks.length === 0 ? (
              <p className="text-sm text-slate-400">No unlocks yet.</p>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full min-w-[520px] text-sm">
                  <thead>
                    <tr className="bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-400">
                      <th className="px-4 py-2.5 font-medium">Candidate</th>
                      <th className="px-4 py-2.5 font-medium">Unlocked</th>
                      <th className="px-4 py-2.5 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {u!.unlocks.map((x, i) => (
                      <tr key={i}>
                        <td className="px-4 py-2.5">
                          {x.candidate_id ? (
                            <Link href={`/candidates/${x.candidate_id}`} className="font-medium text-slate-800 hover:text-sky-600">{x.name}</Link>
                          ) : (
                            <span className="font-medium text-slate-800">{x.name}</span>
                          )}
                          {x.title && <span className="text-slate-400"> · {x.title}</span>}
                        </td>
                        <td className="px-4 py-2.5 text-slate-500">{when(x.unlocked_at)}</td>
                        <td className="px-4 py-2.5">
                          {x.in_pipeline
                            ? <span className="inline-flex items-center gap-1 text-xs text-emerald-600"><CheckCircle2 className="h-3.5 w-3.5" /> In your ATS</span>
                            : <span className="text-xs text-slate-400">—</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
