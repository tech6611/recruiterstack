'use client'

import { useState, useEffect, useCallback } from 'react'
import { Loader2, Zap, RefreshCw } from 'lucide-react'
import type { AutomationRunView, AutomationDecision } from '@/lib/types/pipeline-automations'

// What each decision means, in past tense (committed) and conditional (pending).
const PAST: Record<AutomationDecision, string> = {
  advanced: 'Advanced', rejected: 'Archived', escalated: 'Requested approval', held: 'Put on hold', acted: 'Acted',
}
const WOULD: Record<AutomationDecision, string> = {
  advanced: 'Would advance', rejected: 'Would archive', escalated: 'Would request approval', held: 'Would hold', acted: 'Would act',
}
function phrase(r: AutomationRunView): string {
  const d = (r.decision ?? 'acted') as AutomationDecision
  return r.state === 'committed' ? (PAST[d] ?? 'Acted') : (WOULD[d] ?? 'Would act')
}

function stateBadge(state: string): { label: string; cls: string } {
  switch (state) {
    case 'committed': return { label: 'Done', cls: 'bg-emerald-50 text-emerald-700 ring-emerald-200' }
    case 'pending':   return { label: 'Suggested', cls: 'bg-amber-50 text-amber-700 ring-amber-200' }
    case 'cancelled': return { label: 'Cancelled', cls: 'bg-slate-100 text-slate-500 ring-slate-200' }
    case 'reverted':  return { label: 'Reverted', cls: 'bg-red-50 text-red-600 ring-red-200' }
    default:          return { label: state, cls: 'bg-slate-100 text-slate-500 ring-slate-200' }
  }
}

export function AutomationActivity({ jobId }: { jobId: string }) {
  const [runs, setRuns] = useState<AutomationRunView[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch(`/api/jobs/${jobId}/automation-activity`).then(r => r.json()).catch(() => null)
    setRuns((res?.data?.runs ?? []) as AutomationRunView[])
    setLoading(false)
  }, [jobId])
  useEffect(() => { load() }, [load])

  return (
    <div className="rounded-xl border border-slate-200 bg-white">
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
        <div className="flex items-center gap-2">
          <Zap className="h-4 w-4 text-amber-500" />
          <div>
            <h3 className="text-[14px] font-semibold text-slate-900">Automation activity</h3>
            <p className="text-[11px] text-slate-500">What your rules did, or would do. Suggestions are logged; they only act once you turn automations on.</p>
          </div>
        </div>
        <button onClick={load} aria-label="Refresh" className="text-slate-400 hover:text-slate-600"><RefreshCw className="h-3.5 w-3.5" /></button>
      </div>

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-4 w-4 animate-spin text-slate-300" /></div>
      ) : runs.length === 0 ? (
        <div className="px-5 py-8 text-center">
          <p className="text-sm text-slate-500">No automation activity yet</p>
          <p className="mt-1 text-xs text-slate-400">Rules are checked every minute — suggestions and actions will appear here.</p>
        </div>
      ) : (
        <ul className="divide-y divide-slate-100">
          {runs.map(r => {
            const b = stateBadge(r.state)
            return (
              <li key={r.id} className="flex items-start gap-3 px-5 py-2.5 text-sm">
                <span className={`mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ring-1 ${b.cls}`}>{b.label}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-slate-800">
                    <span className="font-medium">{phrase(r)}</span>
                    {r.candidate_name ? <> · {r.candidate_name}</> : null}
                  </p>
                  {r.rationale && <p className="text-[12px] text-slate-500">{r.rationale}</p>}
                </div>
                <span className="shrink-0 text-[11px] tabular-nums text-slate-400">{new Date(r.created_at).toLocaleDateString()}</span>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
