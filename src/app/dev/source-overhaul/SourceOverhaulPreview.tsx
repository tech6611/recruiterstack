'use client'

import { useState } from 'react'
import { BetCards, BetsPanel, BetSplitRow } from '@/components/req-jobs/BetCards'
import { BetProfile } from '@/components/req-jobs/IdealProfileTiles'
import { BetSampleCard } from '@/components/req-jobs/BetSampleCard'
import { BriefGlance } from '@/components/req-jobs/BriefGlance'
import { BriefChat } from '@/components/req-jobs/BriefChat'
import { CompetencyWeights } from '@/components/req-jobs/CompetencyWeights'
import { mustHaveFromCriterion, toCriterion, isCriterion, betProfile, saveBetRow, removeBetRow, isBetOverride, moveBet } from '@/lib/icp-gates'
import type { IcpCompetency, IcpMustHave } from '@/lib/types/icp'
import type { SearchCriterion } from '@/lib/types/search-spec'
import { ARCHETYPES, OPTIONS, START } from '../bet-options/BetOptions'
import { mockClient } from '../bet-rows/BetRowsPreview'
import { BRIEF, COMPETENCIES, OLD_BRIEF, PROBES, REASONING, REASONING_SHORT } from './fixture'

/**
 * DEVELOPMENT ONLY. The Scoring page as IcpEditor lays it out — the brief at a glance
 * with the scoring weights at its foot, then the bets, each with its person in one card —
 * built from the same components, with the Strategy & Operations Manager job's data.
 */
export function SourceOverhaulPreview() {
  const [old, setOld] = useState(false)
  const [notes, setNotes] = useState('- Zepto counts as a high-growth startup.')
  const [comps, setComps] = useState<IcpCompetency[]>(COMPETENCIES)
  const total = comps.reduce((s, c) => s + (c.weight || 0), 0)
  const setComp = (i: number, patch: Partial<IcpCompetency>) => setComps((cs) => cs.map((c, j) => (j === i ? { ...c, ...patch } : c)))

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-6">
      <div className="mx-auto max-w-6xl space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm font-semibold text-slate-800">Scoring · dev preview</span>
          <label className="inline-flex items-center gap-1.5 text-xs text-slate-600">
            <input type="checkbox" checked={old} onChange={(e) => setOld(e.target.checked)} />
            Brief written before short tags
          </label>
        </div>

        <section className="rounded-2xl border border-slate-200 bg-white p-4">
          <BriefGlance
            brief={old ? OLD_BRIEF : BRIEF}
            reasoning={REASONING}
            reasoningShort={old ? null : REASONING_SHORT}
            probes={old ? PROBES.map((p) => ({ requirement: p.requirement })) : PROBES}
            editor={(close) => (
              <BriefChat
                onClose={close}
                notes={notes}
                applying={false}
                // A pretend AI (dev preview — no call): echoes the message back as a note.
                ask={async (messages) => {
                  await new Promise((r) => setTimeout(r, 600))
                  const last = messages[messages.length - 1].text
                  return {
                    reply: `Got it — on the rebuild I'll follow: “${last}”. (Pretend answer — dev preview, no AI call.)`,
                    notes: [notes.trim(), `- ${last}`].filter(Boolean).join('\n'),
                    changed: true,
                  }
                }}
                onApply={async (next) => { setNotes(next); return true }}
              />
            )}
          />
          <div className="mt-4 border-t border-slate-100 pt-4">
            <CompetencyWeights
              comps={comps}
              total={total}
              onName={(i, name) => setComp(i, { name })}
              onWeight={(i, w) => setComp(i, { weight: Math.max(0, Math.min(100, w)) })}
              onRemove={(i) => setComps((cs) => cs.filter((_, j) => j !== i))}
              onAdd={() => setComps((cs) => [...cs, { id: `c${Date.now()}`, name: '', weight: 0, behaviours: [] }])}
              onBehaviour={(i, bi, v) => setComp(i, { behaviours: comps[i].behaviours.map((b, j) => (j === bi ? v : b)) })}
              onAddBehaviour={(i) => setComp(i, { behaviours: [...comps[i].behaviours, ''] })}
              onRemoveBehaviour={(i, bi) => setComp(i, { behaviours: comps[i].behaviours.filter((_, j) => j !== bi) })}
            />
          </div>
        </section>

        <Bets />
      </div>
    </div>
  )
}

function Bets() {
  const [gates, setGates] = useState<IcpMustHave[]>(() => START.map((c) => mustHaveFromCriterion(c)))
  const criteria = gates.filter(isCriterion).map((g) => toCriterion(g)!)
  const change = (next: SearchCriterion) => setGates((gs) => gs.map((g) => (g.id === next.id ? mustHaveFromCriterion({ ...next, label: null }) : g)))

  return (
    <BetsPanel count={new Set(criteria.filter((c) => c.bet != null).map((c) => c.bet)).size}>
      <BetCards
        archetypes={ARCHETYPES}
        bets={criteria.filter((c) => c.bet != null)}
        onChange={change}
        onRemoveBet={(ids) => setGates((gs) => gs.filter((g) => !ids.includes(g.id)))}
        options={OPTIONS}
        onAddRow={(row) => setGates((gs) => [...gs.filter((g) => g.id !== row.id), mustHaveFromCriterion(row)])}
        renderRow={(row) => <BetSplitRow row={row} />}
        onMoveBet={(n, step) => setGates((gs) => moveBet(gs, n, step))}
        renderProfile={(n, label) => (
          <BetProfile bet={n} criteria={betProfile(criteria, n)} options={OPTIONS}
            onSave={(next, all) => setGates((gs) => saveBetRow(gs, n, label, next, all))}
            onRemove={(c) => setGates((gs) => removeBetRow(gs, c))} />
        )}
        renderCandidate={(n, label) => (
          <BetSampleCard bare client={mockClient} bet={n} betLabel={label} icpId={null}
            criteria={[...criteria.filter((c) => c.bet === n && !isBetOverride(c)), ...betProfile(criteria, n)]} />
        )}
      />
    </BetsPanel>
  )
}
