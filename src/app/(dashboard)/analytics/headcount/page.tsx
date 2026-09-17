'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Briefcase, CheckCircle, Clock, Layers, RefreshCw, AlertTriangle, Download } from 'lucide-react'
import { downloadCsv, todayStamp } from '@/lib/api/csv-export'
import type { HeadcountReport } from '@/modules/ats/domain/headcount-reporting'

function StatCard({ label, value, sub, icon: Icon, color }: { label: string; value: number | string; sub?: string; icon: React.ElementType; color: string }) {
  return (
    <div className="rounded-2xl bg-white border border-slate-200 px-5 py-4 flex items-center gap-4">
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${color}`}><Icon className="h-5 w-5 text-white" /></div>
      <div>
        <p className="text-2xl font-bold text-slate-900 leading-tight tabular-nums">{value}</p>
        <p className="text-xs font-medium text-slate-500">{label}</p>
        {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  )
}

const monthLabel = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleString('en', { month: 'short', year: '2-digit', timeZone: 'UTC' })
const daysLabel = (d: number | null) => (d === null ? '—' : `${d}d`)

export default function HeadcountAnalyticsPage() {
  const [data, setData] = useState<HeadcountReport | null>(null)
  const [months, setMonths] = useState(12)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const res = await fetch(`/api/analytics/headcount?months=${months}`)
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || 'Failed to load')
      setData(j.data as HeadcountReport)
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed to load') } finally { setLoading(false) }
  }, [months])
  useEffect(() => { load() }, [load])

  const exportCsv = () => {
    if (!data) return
    const rows = [['Month', 'Approved', 'Opened', 'Filled', 'Closed'], ...data.monthly.map(m => [m.month, m.approved, m.opened, m.filled, m.closed])]
    downloadCsv(`headcount-${todayStamp()}.csv`, rows.map(r => r.map(String)))
  }

  const maxMonthly = data ? Math.max(1, ...data.monthly.map(m => Math.max(m.opened, m.filled, m.closed))) : 1

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Headcount</h1>
          <p className="text-sm text-slate-500 mt-1">Seats behind your requisitions: what is open, filled and closed, how long a seat takes to fill, and which jobs still have seats left.</p>
          <div className="mt-2 flex gap-3 text-xs">
            <Link href="/analytics" className="text-emerald-700 hover:underline">Pipeline analytics</Link>
            <Link href="/openings" className="text-emerald-700 hover:underline">Requisitions</Link>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <select value={months} onChange={e => setMonths(Number(e.target.value))} className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-sm">
            {[6, 12, 24].map(n => <option key={n} value={n}>Last {n} months</option>)}
          </select>
          <button onClick={exportCsv} disabled={!data} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"><Download className="h-4 w-4" /> CSV</button>
          <button onClick={load} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 hover:bg-slate-50"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /></button>
        </div>
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      {data && (
        <>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
            <StatCard label="Open seats"   value={data.seats.open}     icon={Layers}      color="bg-amber-500" sub={`${data.seats.approved} approved, not yet open`} />
            <StatCard label="Filled"       value={data.seats.filled}   icon={CheckCircle} color="bg-emerald-500" />
            <StatCard label="Closed"       value={data.seats.closed}   icon={Briefcase}   color="bg-slate-500" sub="without a hire" />
            <StatCard label="Awaiting approval" value={data.seats.pending + data.seats.draft} icon={Clock} color="bg-slate-400" sub={`${data.seats.draft} draft`} />
            <StatCard label="Time to fill" value={daysLabel(data.time_to_fill.median_days)} icon={Clock} color="bg-slate-700" sub={`median · ${data.time_to_fill.n} hires`} />
            <StatCard label="Time to start" value={daysLabel(data.time_to_start.median_days)} icon={Clock} color="bg-slate-700" sub={`hire → start · ${data.time_to_start.n}`} />
          </div>

          <div className="rounded-2xl bg-white border border-slate-200 p-6">
            <h2 className="text-sm font-bold text-slate-900 mb-1">Seats per month</h2>
            <p className="text-xs text-slate-400 mb-5">Opened, filled and closed each month.</p>
            <div className="overflow-x-auto">
              <div className="flex items-end gap-3 min-w-[640px] h-44">
                {data.monthly.map(m => (
                  <div key={m.month} className="flex-1 flex flex-col items-center gap-1">
                    <div className="flex items-end gap-0.5 h-32 w-full justify-center">
                      {[['opened', m.opened, 'bg-amber-400'], ['filled', m.filled, 'bg-emerald-500'], ['closed', m.closed, 'bg-slate-300']].map(([k, v, c]) => (
                        <div key={String(k)} title={`${k}: ${v}`} className={`w-3 rounded-t ${c}`} style={{ height: `${Math.max(2, (Number(v) / maxMonthly) * 100)}%` }} />
                      ))}
                    </div>
                    <span className="text-[10px] text-slate-500">{monthLabel(m.month)}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="mt-3 flex gap-4 text-[11px] text-slate-500">
              <span><span className="inline-block h-2 w-2 rounded-sm bg-amber-400 mr-1" />Opened</span>
              <span><span className="inline-block h-2 w-2 rounded-sm bg-emerald-500 mr-1" />Filled</span>
              <span><span className="inline-block h-2 w-2 rounded-sm bg-slate-300 mr-1" />Closed</span>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="rounded-2xl bg-white border border-slate-200 p-6">
              <h2 className="text-sm font-bold text-slate-900 mb-1">By department</h2>
              <p className="text-xs text-slate-400 mb-4">Seats and median time to fill.</p>
              {data.by_department.length === 0 ? <p className="text-sm text-slate-400 py-6 text-center">No requisitions yet.</p> : (
                <table className="w-full text-sm">
                  <thead><tr className="text-[11px] uppercase tracking-wide text-slate-400"><th className="text-left py-1">Department</th><th className="text-right">Approved</th><th className="text-right">Open</th><th className="text-right">Filled</th><th className="text-right">Time to fill</th></tr></thead>
                  <tbody>
                    {data.by_department.map(d => {
                      const ttf = data.time_to_fill.by_department.find(x => x.department === d.department)
                      return (
                        <tr key={d.department} className="border-t border-slate-100 tabular-nums">
                          <td className="py-2 text-slate-800">{d.department}</td>
                          <td className="text-right text-slate-600">{d.approved}</td>
                          <td className="text-right text-amber-700 font-medium">{d.open}</td>
                          <td className="text-right text-emerald-700 font-medium">{d.filled}</td>
                          <td className="text-right text-slate-600">{daysLabel(ttf?.median_days ?? null)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>

            <div className="rounded-2xl bg-white border border-slate-200 p-6">
              <h2 className="text-sm font-bold text-slate-900 mb-1">Open jobs and seats left</h2>
              <p className="text-xs text-slate-400 mb-4">Sorted by the longest-open seat.</p>
              {data.open_jobs.length === 0 ? <p className="text-sm text-slate-400 py-6 text-center">No open jobs.</p> : (
                <ul className="divide-y divide-slate-100">
                  {data.open_jobs.map(j => (
                    <li key={j.id} className="flex items-center justify-between py-2 gap-3">
                      <div className="min-w-0">
                        <Link href={`/req-jobs/${j.id}`} className="text-sm font-medium text-slate-800 hover:text-emerald-700 truncate block">{j.title}</Link>
                        <p className="text-xs text-slate-400">{j.department ?? 'No department'}{j.oldest_open_days !== null ? ` · open ${j.oldest_open_days}d` : ''}</p>
                      </div>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums ${j.remaining === 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                        {j.filled}/{j.total} filled
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {data.stale_open_seats.length > 0 && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
              <h2 className="flex items-center gap-2 text-sm font-bold text-amber-900"><AlertTriangle className="h-4 w-4" /> Seats open for 60+ days</h2>
              <ul className="mt-2 space-y-1 text-sm text-amber-900">
                {data.stale_open_seats.map(s => (
                  <li key={s.id}><Link href={`/openings/${s.id}`} className="hover:underline">{s.number ? `REQ-${s.number} · ` : ''}{s.title}</Link> <span className="text-amber-700">· {s.department} · {s.open_days}d</span></li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  )
}
