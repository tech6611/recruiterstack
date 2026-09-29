'use client'

import { useState } from 'react'
import { BetCards } from '@/components/req-jobs/BetCards'
import { IdealProfileTiles } from '@/components/req-jobs/IdealProfileTiles'
import { SourcingMatrix, type MatrixMatch } from '@/components/req-jobs/SourcingMatrix'
import type { SearchCriterion } from '@/lib/types/search-spec'
import type { FetchedOptions } from '@/lib/icp-options'

/**
 * DEVELOPMENT ONLY. The Scoring bets + ideal profile and the Source results table, with
 * the Strategy & Operations Manager job's real data, for review without signing in.
 */

const OPTIONS: FetchedOptions = {
  cities: ['Bengaluru, Karnataka, India'], titles: ['Consultant', 'Associate', 'Strategy Manager', 'Analyst'],
  companies: ['McKinsey', 'Bain', 'BCG', 'Kearney', 'Swiggy', 'Zepto'], skills: [], departments: [],
}

const ARCHETYPES = [
  { name: 'The Classic Post-Consulting Operator', thesis: 'A purebred problem-solver from an MBB firm, trained in structured thinking, who is now eager to get hands-on operational experience.', where_from: '2-3 years as a Business Analyst or Associate at McKinsey, Bain, or BCG.', why_interested: "To escape the 'PowerPoint factory' and get meaningful equity in a high-potential AI startup.", why_no: 'May be too theoretical and unaccustomed to the speed of execution.', hire_risk: "Analysis paralysis; struggles to shift from 'recommending' to 'doing'." },
  { name: 'The Scaled Startup BizOps Star', thesis: 'Has already made the leap into a high-growth Indian startup and seen the 10x–100x journey.', where_from: 'Strategy/BizOps at Udaan, Swiggy, Razorpay, or CRED.', why_interested: 'To join an even earlier stage and own more.', why_no: 'Used to the resources of a well-funded scale-up.', hire_risk: "Brings a 'late-stage' scaling playbook to a seed-stage company." },
  { name: 'The IB/VC Analyst Seeking Alpha', thesis: 'Highly quantitative; wants to move from evaluating companies to building one.', where_from: 'Analyst at Goldman Sachs, Morgan Stanley; Associate at Sequoia, Accel.', why_interested: 'Tired of the transactional lifestyle.', why_no: 'Likely no real operational experience.', hire_risk: 'Excels at a model in Excel; struggles with a messy, real project.', is_non_obvious: true },
]

const bet = (n: number, bet_label: string, companies: string[], titles: string[]): SearchCriterion[] => [
  { id: `ip-bet-${n}-companies`, kind: 'employer_current', values: companies, relax_at: 2, bet: n, bet_label },
  { id: `ip-bet-${n}-titles`, kind: 'title_current', values: titles, relax_at: 3, bet: n, bet_label },
]
const START: SearchCriterion[] = [
  { id: 'ip-location', kind: 'location', values: ['Bengaluru, Karnataka, IN'], radius_km: 50, relax_at: 4 },
  { id: 'ip-years', kind: 'years_band', values: [], min: 2, max: 6, relax_at: null },
  { id: 'ip-school', kind: 'school', values: ['Indian Institute of Technology', 'IIT', 'Indian Institute of Management', 'IIM', 'ISB', 'BITS Pilani'], relax_at: 3 },
  ...bet(1, ARCHETYPES[0].name, ['McKinsey', 'Bain', 'Boston Consulting Group', 'BCG'], ['Business Analyst', 'Associate', 'Consultant']),
  ...bet(2, ARCHETYPES[1].name, ['Udaan', 'Swiggy', 'Razorpay', 'CRED', 'Flipkart', 'Zomato', 'Google'], ['Strategy Manager', 'Business Operations Manager', 'Program Manager']),
  ...bet(3, ARCHETYPES[2].name, ['Goldman Sachs', 'Morgan Stanley', 'Sequoia Capital', 'Accel', 'Lightspeed Venture Partners'], ['Analyst', 'Associate']),
]

// Two of the job's real candidates: one re-ranked against today's profile, one still
// carrying its V5 result (22 years — failed V5's years check under a different label).
const ICP = {
  must_haves: [
    { id: 'ip-location', label: 'Within 50 km of Bengaluru, Karnataka, IN', attribute: 'location', relax_at: 4, kind: 'location' as const },
    { id: 'ip-years', label: '2–6 years', attribute: 'years_band', relax_at: null, kind: 'years_band' as const },
  ],
  competencies: [
    { id: 'c1', name: 'Structured Problem-Solving', weight: 40 }, { id: 'c2', name: 'Hands-On Analytical Horsepower', weight: 30 },
    { id: 'c3', name: 'Ownership & Bias for Action', weight: 20 }, { id: 'c4', name: 'Strategic & Commercial Acumen', weight: 10 },
  ],
}
const comps = (r: number[]) => ICP.competencies.map((c, i) => ({ name: c.name, rating: r[i], evidence: '' }))
const MATCHES = [
  { candidate_id: 'a', score: 63, gate_failures: [], gate_unknown: [], competencies: comps([3, 2, 4, 3]), candidate: { id: 'a', name: 'Sukheth Kallupalli (re-ranked)', current_title: 'Associate', current_company: 'Boston Consulting Group (BCG)', location: 'Bengaluru, India' } },
  { candidate_id: 'b', score: 20, gate_failures: [{ label: 'Has between 2 and 6 years of professional experience' }], competencies: comps([4, 2, 4, 4]), stale: true, candidate: { id: 'b', name: 'Priyank Gupta (scored against V5)', current_title: 'Managing Director', current_company: 'Sahaj Software', location: 'Bengaluru' } },
] as unknown as MatrixMatch[]

export function BetOptions() {
  const [criteria, setCriteria] = useState<SearchCriterion[]>(START)
  const change = (next: SearchCriterion) => setCriteria((cs) => cs.map((c) => (c.id === next.id ? next : c)))
  return (
    <main className="mx-auto max-w-6xl space-y-8 px-6 py-10">
      <section>
        <h2 className="mb-2 text-base font-bold text-slate-900">Scoring — who we&apos;re betting on</h2>
        <BetCards
          archetypes={ARCHETYPES}
          bets={criteria.filter((c) => c.bet != null)}
          onChange={change}
          onRemoveBet={(ids) => setCriteria((cs) => cs.filter((c) => !ids.includes(c.id)))}
          options={OPTIONS}
        />
      </section>
      <section>
        <h2 className="mb-2 text-base font-bold text-slate-900">Scoring — ideal profile</h2>
        <IdealProfileTiles
          criteria={criteria}
          options={OPTIONS}
          onChange={change}
          onAdd={(c) => setCriteria((cs) => [...cs, c])}
          onRemove={(id) => setCriteria((cs) => cs.filter((c) => c.id !== id))}
        />
      </section>
      <section>
        <h2 className="mb-2 text-base font-bold text-slate-900">Source — results table</h2>
        <SourcingMatrix matches={MATCHES} icp={ICP} selected={new Set()} onToggle={() => {}} />
      </section>
    </main>
  )
}
