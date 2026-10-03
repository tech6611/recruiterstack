'use client'

import { useState } from 'react'
import { BetCards } from '@/components/req-jobs/BetCards'
import { BetProfile } from '@/components/req-jobs/IdealProfileTiles'
import { mustHaveFromCriterion, toCriterion, isCriterion, betProfile, saveBetRow, removeBetRow, isBetOverride } from '@/lib/icp-gates'
import { BetSampleCard, type BetSampleClient } from '@/components/req-jobs/BetSampleCard'
import { rankBetSamples, hasWords, type BetSamplePerson } from '@/modules/pool/domain/bet-sample-fit'
import type { IcpMustHave } from '@/lib/types/icp'
import type { SearchCriterion } from '@/lib/types/search-spec'
import { ARCHETYPES, OPTIONS, START } from '../bet-options/BetOptions'

/**
 * DEVELOPMENT ONLY. The stacked bet rows on the Scoring tab — card + its own ideal
 * profile on the left, the sample candidate slot on the right — with the Strategy &
 * Operations Manager job's real bets, for review without signing in. Edits run through
 * the same saveBetRow / removeBetRow the Scoring tab uses.
 */
// A few pool people, so the sample card can be clicked through without a database.
const PEOPLE: BetSamplePerson[] = [
  { id: '00000000-0000-4000-8000-000000000001', display_name: 'Ananya Rao', current_title: 'Associate', current_company: 'McKinsey & Company', location_raw: 'Bengaluru', location_city: 'Bengaluru', location_region: 'Karnataka', location_country_code: 'IN', experience_years: 3.5, education: [{ school: 'IIM Ahmedabad' }], reachable: true },
  { id: '00000000-0000-4000-8000-000000000002', display_name: 'Karan Mehta', current_title: 'Senior Associate Consultant', current_company: 'Bain & Company', location_raw: 'Mumbai', location_city: 'Mumbai', location_region: 'Maharashtra', location_country_code: 'IN', experience_years: 5, education: [{ school: 'IIT Delhi' }], reachable: true },
  { id: '00000000-0000-4000-8000-000000000003', display_name: 'Shyam D', current_title: 'Manager - Central Strategy', current_company: 'Flipkart', location_raw: 'Bengaluru', location_city: 'Bengaluru', location_region: 'Karnataka', location_country_code: 'IN', experience_years: 5.7, education: [{ school: 'IIT Guwahati' }], reachable: true },
  { id: '00000000-0000-4000-8000-000000000004', display_name: 'Meera Iyer', current_title: 'Strategy Manager', current_company: 'Swiggy', location_raw: 'Bengaluru', location_city: 'Bengaluru', location_region: 'Karnataka', location_country_code: 'IN', experience_years: 7, education: [{ school: 'ISB' }], reachable: false },
]
const decided = new Map<string, 'yes' | 'no'>()
let spent = 0
// A pretend market: everyone at the bet's companies, served 3 at a time at 0.03 credits each.
const fetched = new Map<string, string[]>()
const mockClient: BetSampleClient = {
  async sample({ bet, criteria, skip }) {
    await new Promise((r) => setTimeout(r, 400))
    const emp = criteria.find((c) => c.kind.startsWith('employer_'))
    const market = PEOPLE.filter((p) => emp?.values.some((v) => hasWords(p.current_company, v)))
    const mine = Array.from(decided.entries()).filter(([k]) => k.startsWith(`${bet}:`))
    const tally = { yes: mine.filter(([, d]) => d === 'yes').length, no: mine.filter(([, d]) => d === 'no').length }
    const base = { decided: tally, total: market.length, cap: 5 }
    if (!emp) return { ...base, person: null, checks: [], remaining: 0, total: null, spent, reason: 'no_companies' }
    const key = `${bet}:${JSON.stringify(criteria.map((c) => [c.kind, c.values, c.min, c.max]))}`
    const have = fetched.get(key) ?? []
    const unseen = (ids: string[]) => ids.filter((id) => !decided.has(`${bet}:${id}`) && !skip.includes(id))
    if (!unseen(have).length && have.length < market.length) {
      const page = market.slice(have.length, have.length + 3).map((p) => p.id)
      spent += page.length * 0.03
      fetched.set(key, [...have, ...page])
    }
    const ids = unseen(fetched.get(key) ?? [])
    if (!ids.length) return { ...base, person: null, checks: [], remaining: 0, spent, reason: market.length ? 'all_seen' : 'none' }
    const [best, ...rest] = rankBetSamples(PEOPLE.filter((p) => ids.includes(p.id)), criteria)
    return { ...base, person: best.person, checks: best.checks, remaining: rest.length, spent, reason: null }
  },
  async decide({ bet, profile_id, decision }) { decided.set(`${bet}:${profile_id}`, decision) },
}

export function BetRowsPreview() {
  const [gates, setGates] = useState<IcpMustHave[]>(() => START.map((c) => mustHaveFromCriterion(c)))
  const criteria = gates.filter(isCriterion).map((g) => toCriterion(g)!)
  const change = (next: SearchCriterion) => setGates((gs) => gs.map((g) => (g.id === next.id ? mustHaveFromCriterion({ ...next, label: null }) : g)))

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
          onAddRow={(row) => setGates((gs) => [...gs.filter((g) => g.id !== row.id), mustHaveFromCriterion(row)])}
          onSuggestTitles={async () => {
            await new Promise((r) => setTimeout(r, 500))
            return {
              line_of_work: 'Pretend answer (dev preview — no AI call)',
              observed: 2,
              titles: [{ title: 'Investment Banking Analyst', why: 'what IB analysts call themselves there' }, { title: 'Private Equity Associate', why: 'PE deal teams' }],
              exclusions: [{ title: 'Software Engineer', why: 'engineering, not deal work' }],
            }
          }}
          renderProfile={(n, label) => (
            <BetProfile
              bet={n}
              criteria={betProfile(criteria, n)}
              options={OPTIONS}
              onSave={(next, all) => setGates((gs) => saveBetRow(gs, n, label, next, all))}
              onRemove={(c) => setGates((gs) => removeBetRow(gs, c))}
            />
          )}
          renderCandidate={(n, label) => (
            <BetSampleCard
              client={mockClient}
              bet={n}
              betLabel={label}
              icpId={null}
              criteria={[...criteria.filter((c) => c.bet === n && !isBetOverride(c)), ...betProfile(criteria, n)]}
            />
          )}
        />
        <pre className="mt-6 max-h-64 overflow-auto rounded-lg bg-slate-900 p-3 text-[10px] text-slate-200">
          {JSON.stringify(gates.map((g) => ({ id: g.id, bet: g.bet ?? null, label: g.label, enforcement: g.enforcement })), null, 1)}
        </pre>
      </div>
    </div>
  )
}
