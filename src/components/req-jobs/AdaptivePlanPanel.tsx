'use client'

import { useState } from 'react'
import { Radar, Building2, Briefcase, MapPin, Check, ChevronRight, Target } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import type { AdaptivePlanResult, AdaptiveMove } from '@/modules/pool/search/adaptive-plan'

/**
 * #3 UI — "Plan the market". Runs the adaptive planner (propose-only): probes each level's
 * reach against the per-role target and, while short, has the brain widen (more same-space
 * companies → feeder titles → wider location), narrating each move Juicebox-style. The
 * recruiter can then apply the proposed plan as the job's search plan.
 */
function moveIcon(kind: AdaptiveMove['kind']) {
  if (kind === 'more_companies') return <Building2 className="h-3.5 w-3.5" />
  if (kind === 'feeder_titles') return <Briefcase className="h-3.5 w-3.5" />
  return <MapPin className="h-3.5 w-3.5" />
}

export function AdaptivePlanPanel({ jobId, onApplied }: { jobId: string; onApplied?: () => void }) {
  const [planning, setPlanning] = useState(false)
  const [applying, setApplying] = useState(false)
  const [result, setResult] = useState<AdaptivePlanResult | null>(null)

  async function plan() {
    setPlanning(true)
    try {
      const res = await fetch(`/api/jobs/${jobId}/source/plan/adaptive`, { method: 'POST' })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        if (res.status === 503) toast('The market source isn’t switched on for your workspace yet.')
        else toast.error(j.error ?? 'Could not plan the search')
        return
      }
      const { data } = await res.json()
      setResult(data as AdaptivePlanResult)
    } finally {
      setPlanning(false)
    }
  }

  async function apply() {
    if (!result) return
    setApplying(true)
    const res = await fetch(`/api/jobs/${jobId}/source/spec`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ spec: result.spec }),
    })
    setApplying(false)
    if (!res.ok) { toast.error('Could not apply the plan'); return }
    toast.success('Plan applied — it’s now this job’s search plan.')
    onApplied?.()
  }

  const expansions = result?.steps.filter((s) => s.move) ?? []

  return (
    <section className="mt-3 rounded-xl border border-slate-200 bg-white">
      <div className="flex items-center justify-between gap-2 px-3 py-2">
        <span className="flex items-center gap-2 text-xs font-semibold text-slate-700">
          <Radar className="h-4 w-4 text-emerald-600" /> Plan the market
          <span className="font-normal text-slate-400">— let the recruiter brain size the search and widen it</span>
        </span>
        <Button size="sm" variant="outline" onClick={plan} loading={planning} title="Probe the market and widen the plan to hit the target — spends only tiny count probes, never acquires">
          <Radar className="h-3.5 w-3.5" /> {result ? 'Re-plan' : 'Plan'}
        </Button>
      </div>

      {result && (
        <div className="border-t border-slate-100 px-3 py-3">
          {/* summary */}
          <div className="mb-3 flex flex-wrap items-center gap-2 text-[11px]">
            <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">
              <Target className="h-3 w-3" /> target {result.target}
            </span>
            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium ${result.met ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
              ~{result.reach.toLocaleString()} reachable {result.met ? '· target met' : '· still short'}
            </span>
            {result.capped && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-amber-700">stopped at the expansion cap</span>}
          </div>

          {/* the reasoning — each widening move, Juicebox-style */}
          <div className="mb-3 space-y-1.5">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">How it widened</div>
            <div className="text-[12px] text-slate-500">Started at the ideal profile · ~{result.steps[0]?.reachAfter.toLocaleString() ?? 0} reachable.</div>
            {expansions.length === 0 ? (
              <div className="text-[12px] text-slate-500">Deep enough at the ideal — no widening needed.</div>
            ) : (
              expansions.map((s, i) => (
                <div key={i} className="flex items-start gap-2 text-[12px]">
                  <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded bg-emerald-50 text-emerald-600">{moveIcon(s.move!.kind)}</span>
                  <div className="min-w-0">
                    <span className="font-medium text-slate-700">{s.move!.label}</span>
                    <span className="text-slate-400"> → ~{s.reachAfter.toLocaleString()} reachable</span>
                    {s.move!.rationale && <div className="text-[11px] text-slate-500">{s.move!.rationale}</div>}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* the proposed levels + their probed counts */}
          <div className="mb-3">
            <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Proposed plan · {result.perLevel.length} levels</div>
            <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
              {result.perLevel.map((l, i) => (
                <li key={i} className="flex items-center gap-2 px-2.5 py-1.5 text-[12px]">
                  <ChevronRight className="h-3 w-3 shrink-0 text-slate-300" />
                  <span className="min-w-0 flex-1 truncate text-slate-600" title={l.label}>{l.label}</span>
                  <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 font-medium tabular-nums text-slate-600">{l.total == null ? '—' : l.total.toLocaleString()}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="flex items-center justify-end gap-2">
            <span className="mr-auto text-[11px] text-slate-400">Propose-only — nothing was acquired.</span>
            <Button size="sm" onClick={apply} loading={applying}>
              <Check className="h-3.5 w-3.5" /> Apply this plan
            </Button>
          </div>
        </div>
      )}
    </section>
  )
}
