'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Beaker, Loader2 } from 'lucide-react'
import type { SourcingExperiment } from '@/lib/types/sourcing-experiment'

type Row = SourcingExperiment & { job?: { title?: string | null } | null }

function yes(variant: SourcingExperiment['baseline']) { return (variant.candidates ?? []).filter((candidate) => candidate.decision === 'yes').length }
function decided(variant: SourcingExperiment['baseline']) { return (variant.candidates ?? []).filter((candidate) => candidate.decision != null).length }

/** Portfolio view: compare recruiter-reviewed results across jobs, markets, and role families. */
export function SourcingLabDashboard() {
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    fetch('/api/sourcing-experiments').then((response) => response.ok ? response.json() : { data: [] })
      .then((json) => setRows(json.data ?? [])).catch(() => {}).finally(() => setLoading(false))
  }, [])
  const totals = useMemo(() => rows.reduce((sum, row) => ({
    experiments: sum.experiments + (row.status === 'completed' ? 1 : 0),
    baselineYes: sum.baselineYes + yes(row.baseline), challengerYes: sum.challengerYes + yes(row.challenger),
    baselineDecisions: sum.baselineDecisions + decided(row.baseline), challengerDecisions: sum.challengerDecisions + decided(row.challenger),
  }), { experiments: 0, baselineYes: 0, challengerYes: 0, baselineDecisions: 0, challengerDecisions: 0 }), [rows])
  return <main className="mx-auto max-w-6xl px-6 py-8">
    <div className="mb-7 flex items-start gap-3"><span className="rounded-lg bg-violet-100 p-2 text-violet-700"><Beaker className="h-5 w-5" /></span><div><h1 className="text-xl font-semibold text-slate-900">Sourcing Lab</h1><p className="mt-1 text-sm text-slate-500">External-market experiments, evaluated through recruiter decisions.</p></div></div>
    {loading ? <div className="flex items-center gap-2 text-sm text-slate-400"><Loader2 className="h-4 w-4 animate-spin" /> Loading experiments…</div> : rows.length === 0 ? <p className="rounded-xl border border-dashed border-slate-200 p-5 text-sm text-slate-500">No completed comparisons yet. Open a job’s Sourcing tab and run a Sourcing Lab comparison.</p> : <>
      <div className="mb-6 grid gap-3 sm:grid-cols-3"><Metric label="Completed comparisons" value={totals.experiments} /><Metric label="Current strategy · promising" value={`${totals.baselineYes}/${totals.baselineDecisions || '—'}`} /><Metric label="Challenger · promising" value={`${totals.challengerYes}/${totals.challengerDecisions || '—'}`} /></div>
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white"><table className="w-full text-left text-sm"><thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">Job</th><th className="px-4 py-3">Run</th><th className="px-4 py-3">Current</th><th className="px-4 py-3">Challenger</th><th className="px-4 py-3">External profiles / credits</th></tr></thead><tbody className="divide-y divide-slate-100">{rows.map((row) => <tr key={row.id}><td className="px-4 py-3"><Link href={`/jobs/${row.job_id}?tab=sourcing`} className="font-medium text-indigo-700 hover:underline">{row.job?.title ?? 'Untitled job'}</Link></td><td className="px-4 py-3 text-xs text-slate-500">{new Date(row.created_at).toLocaleDateString()}<br />{row.status}</td><td className="px-4 py-3 text-xs text-slate-600"><strong className="text-emerald-700">{yes(row.baseline)}</strong> promising / {decided(row.baseline)} reviewed</td><td className="px-4 py-3 text-xs text-slate-600"><strong className="text-violet-700">{yes(row.challenger)}</strong> promising / {decided(row.challenger)} reviewed</td><td className="px-4 py-3 text-xs text-slate-500">{(row.baseline.fetched ?? 0) + (row.challenger.fetched ?? 0)} / {((row.baseline.credits_used ?? 0) + (row.challenger.credits_used ?? 0)).toFixed(2)}</td></tr>)}</tbody></table></div>
    </>}
  </main>
}

function Metric({ label, value }: { label: string; value: string | number }) { return <div className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-xs text-slate-500">{label}</p><p className="mt-1 text-2xl font-semibold text-slate-900">{value}</p></div> }
