'use client'

import { useState } from 'react'
import { BetCards } from '@/components/req-jobs/BetCards'
import { BetProfile } from '@/components/req-jobs/IdealProfileTiles'
import { mustHaveFromCriterion, toCriterion, isCriterion, betProfile, saveBetRow, removeBetRow } from '@/lib/icp-gates'
import type { IcpMustHave } from '@/lib/types/icp'
import type { SearchCriterion } from '@/lib/types/search-spec'
import { ARCHETYPES, OPTIONS, START } from '../bet-options/BetOptions'

/**
 * DEVELOPMENT ONLY. The stacked bet rows on the Scoring tab — card + its own ideal
 * profile on the left, the sample candidate slot on the right — with the Strategy &
 * Operations Manager job's real bets, for review without signing in. Edits run through
 * the same saveBetRow / removeBetRow the Scoring tab uses.
 */
export function BetRowsPreview() {
  const [gates, setGates] = useState<IcpMustHave[]>(() => START.map((c) => mustHaveFromCriterion(c)))
  const criteria = gates.filter(isCriterion).map((g) => toCriterion(g)!)
  const change = (next: SearchCriterion) => setGates((gs) => gs.map((g) => (g.id === next.id ? mustHaveFromCriterion(next) : g)))

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-6xl rounded-2xl border border-slate-200 bg-white p-5">
        <h1 className="mb-3 text-sm font-semibold text-slate-800">Who we&apos;re betting on (dev preview)</h1>
        <BetCards
          archetypes={ARCHETYPES}
          bets={criteria.filter((c) => c.bet != null)}
          onChange={change}
          onRemoveBet={(ids) => setGates((gs) => gs.filter((g) => !ids.includes(g.id)))}
          options={OPTIONS}
          renderProfile={(n, label) => (
            <BetProfile
              bet={n}
              criteria={betProfile(criteria, n)}
              options={OPTIONS}
              onSave={(next, all) => setGates((gs) => saveBetRow(gs, n, label, next, all))}
              onRemove={(c) => setGates((gs) => removeBetRow(gs, c))}
            />
          )}
          renderCandidate={() => (
            <div className="flex min-h-[8rem] flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-white/60 p-4 text-center">
              <div className="text-xs font-semibold text-slate-500">Sample candidate</div>
              <p className="mt-1 text-[11px] leading-relaxed text-slate-400">A real person who fits this bet will show here, to mark 👍 or 👎.</p>
            </div>
          )}
        />
        <pre className="mt-6 max-h-64 overflow-auto rounded-lg bg-slate-900 p-3 text-[10px] text-slate-200">
          {JSON.stringify(gates.map((g) => ({ id: g.id, bet: g.bet ?? null, label: g.label, enforcement: g.enforcement })), null, 1)}
        </pre>
      </div>
    </div>
  )
}
