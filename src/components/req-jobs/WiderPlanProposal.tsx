'use client'

import { Building2, Briefcase, MapPin, Check, Target, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { AdaptivePlanResult, AdaptiveMove } from '@/modules/pool/search/adaptive-plan'

/**
 * #3 UI — "Suggest a wider plan", shown INSIDE the Search plan panel (it used to be a
 * separate "Plan the market" panel whose Apply overwrote the plan unseen). The adaptive
 * planner (propose-only) probed each level's reach against the per-role target and, while
 * short, had the brain widen (more same-space companies → feeder titles → wider
 * location). This shows its reasoning and the proposed plan with the NEW levels marked;
 * nothing changes until the recruiter accepts.
 */
function moveIcon(kind: AdaptiveMove['kind']) {
  if (kind === 'more_companies') return <Building2 className="h-3.5 w-3.5" />
  if (kind === 'feeder_titles') return <Briefcase className="h-3.5 w-3.5" />
  return <MapPin className="h-3.5 w-3.5" />
}

export function WiderPlanProposal({ result, currentLevelIds, onAccept, onDiscard, accepting }: {
  result: AdaptivePlanResult
  /** Level ids in the plan as it stands, so the proposal's additions can be marked. */
  currentLevelIds: Set<string>
  onAccept: () => void
  onDiscard: () => void
  accepting: boolean
}) {
  const expansions = result.steps.filter((s) => s.move)
  const added = result.spec.levels.filter((l) => !currentLevelIds.has(l.id)).length

  return (
    <div className="border-t border-emerald-200 bg-emerald-50/40 px-3 py-3">
      <div className="mb-2 flex flex-wrap items-center gap-2 text-[11px]">
        <span className="font-semibold text-slate-700">Suggested wider plan</span>
        <span className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-0.5 text-slate-600 ring-1 ring-slate-200">
          <Target className="h-3 w-3" /> target {result.target}
        </span>
        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium ${result.met ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-50 text-amber-700'}`}>
          ~{result.reach.toLocaleString()} at your target tiers {result.met ? '· target met' : '· still short'}
        </span>
        {result.capped && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-amber-700">stopped at the expansion cap</span>}
      </div>

      {/* the reasoning — each widening move */}
      <div className="mb-3 space-y-1.5">
        <div className="text-[12px] text-slate-500">Started at the ideal profile · ~{result.steps[0]?.reachAfter.toLocaleString() ?? 0} reachable.</div>
        {expansions.length === 0 ? (
          <div className="text-[12px] text-slate-500">Deep enough at the ideal — no widening needed.</div>
        ) : (
          expansions.map((s, i) => (
            <div key={i} className="flex items-start gap-2 text-[12px]">
              <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded bg-emerald-100 text-emerald-700">{moveIcon(s.move!.kind)}</span>
              <div className="min-w-0">
                <span className="font-medium text-slate-700">{s.move!.label}</span>
                <span className="text-slate-400"> → ~{s.reachAfter.toLocaleString()} reachable</span>
                {s.move!.rationale && <div className="text-[11px] text-slate-500">{s.move!.rationale}</div>}
              </div>
            </div>
          ))
        )}
      </div>

      {/* the proposed plan, with what's new marked */}
      <ul className="mb-3 divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
        {result.spec.levels.map((l, i) => {
          const isNew = !currentLevelIds.has(l.id)
          // Match by lane key: a level the source can't search has no lane, so indexes shift.
          const total = result.perLevel.find((p) => p.key.startsWith(`L${i + 1}:`))?.total
          return (
            <li key={l.id} className={`flex items-center gap-2 px-2.5 py-1.5 text-[12px] ${l.fallback ? 'opacity-60' : ''}`}>
              <span className="shrink-0 rounded bg-indigo-100 px-1.5 py-0.5 text-[10px] font-bold text-indigo-800">L{i + 1}</span>
              <span className="min-w-0 flex-1 truncate text-slate-600" title={l.label}>
                {l.label}
                {l.fallback && <span className="ml-1 text-[10px] text-slate-400">· catch-all, not counted</span>}
              </span>
              {isNew && <span className="shrink-0 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-800">new</span>}
              <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 font-medium tabular-nums text-slate-600">{total == null ? '—' : total.toLocaleString()}</span>
            </li>
          )
        })}
      </ul>

      <div className="flex flex-wrap items-center justify-end gap-2">
        <span className="mr-auto text-[11px] text-slate-400">
          {added > 0 ? `Adds ${added} level${added === 1 ? '' : 's'} after your current plan.` : 'No new levels.'} Nothing was acquired.
        </span>
        <Button size="sm" variant="ghost" onClick={onDiscard}><X className="h-3.5 w-3.5" /> Discard</Button>
        <Button size="sm" onClick={onAccept} loading={accepting} disabled={added === 0}>
          <Check className="h-3.5 w-3.5" /> Accept
        </Button>
      </div>
    </div>
  )
}
