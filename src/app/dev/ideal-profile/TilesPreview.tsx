'use client'

import { useState } from 'react'
import { IdealProfileTiles } from '@/components/req-jobs/IdealProfileTiles'
import type { SearchCriterion } from '@/lib/types/search-spec'
import type { FetchedOptions } from '@/lib/icp-options'

/**
 * DEVELOPMENT ONLY. The ideal-profile strip with real-shaped suggestion lists passed
 * in, so the pickers can be reviewed without an authenticated /api/icp/options call.
 */
const OPTIONS: FetchedOptions = {
  cities: [
    'San Francisco, California, United States', 'Bengaluru, Karnataka, India',
    'New York, New York, United States', 'London, England, United Kingdom',
    'Hyderabad, Telangana, India', 'Pune, Maharashtra, India',
    'Seattle, Washington, United States', 'Singapore', 'Berlin, Germany',
  ],
  titles: [
    'Software Engineer', 'Senior Software Engineer', 'Engineering Manager',
    'Software Engineering Manager', 'Staff Engineer', 'Principal Engineer',
    'Director of Engineering', 'VP of Engineering', 'Technical Program Manager',
  ],
  companies: ['Google', 'Meta', 'Flipkart', 'Stripe', 'Rippling', 'Ramp', 'Deel', 'Razorpay', 'Notion', 'SigNoz'],
  skills: ['Python', 'TypeScript', 'React', 'Kubernetes', 'PostgreSQL', 'Go', 'AWS', 'System Design'],
  departments: ['Engineering', 'Product', 'Design'],
}

// The Strategy & Operations Manager job, organised into bets.
const bet = (n: number, bet_label: string, companies: string[], titles: string[]): SearchCriterion[] => [
  { id: `ip-bet-${n}-companies`, kind: 'employer_current', values: companies, relax_at: 2, bet: n, bet_label },
  { id: `ip-bet-${n}-titles`, kind: 'title_current', values: titles, relax_at: 3, bet: n, bet_label },
]
const START: SearchCriterion[] = [
  { id: 'ip-location', kind: 'location', values: ['Bengaluru, Karnataka, IN'], radius_km: 50, relax_at: 4 },
  { id: 'ip-years', kind: 'years_band', values: [], min: 2, max: 6, relax_at: null },
  { id: 'ip-school', kind: 'school', values: ['Indian Institute of Technology', 'IIT', 'Indian Institute of Management', 'IIM', 'ISB', 'BITS Pilani'], relax_at: 3 },
  ...bet(1, 'The Classic Post-Consulting Operator', ['McKinsey', 'Bain', 'Boston Consulting Group', 'BCG'], ['Business Analyst', 'Associate', 'Consultant']),
  ...bet(2, 'The Scaled Startup BizOps Star', ['Udaan', 'Swiggy', 'Razorpay', 'CRED', 'Flipkart', 'Zomato', 'Google'], ['Strategy Manager', 'Business Operations Manager', 'Program Manager', "Chief of Staff's Office"]),
  ...bet(3, 'The IB/VC Analyst Seeking Alpha', ['Goldman Sachs', 'Morgan Stanley', 'Sequoia Capital', 'Accel', 'Lightspeed Venture Partners'], ['Analyst', 'Associate']),
]

export function TilesPreview() {
  const [criteria, setCriteria] = useState<SearchCriterion[]>(START)
  return (
    <main className="px-6 py-10">
      <h1 className="text-xl font-bold text-slate-900">Ideal profile — the record</h1>
      <p className="mt-1 max-w-2xl text-sm text-slate-500">
        Every field, set or not, in a fixed order. Click a row to edit it in place. Location
        and the chip fields are typeaheads over real values that still accept anything typed;
        experience and radius offer the bands recruiters actually ask for and stay keyable.
      </p>
      <div className="mt-6 max-w-4xl rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <IdealProfileTiles
          criteria={criteria}
          options={OPTIONS}
          onChange={(next) => setCriteria((cs) => cs.map((c) => (c.id === next.id ? next : c)))}
          onAdd={(c) => setCriteria((cs) => [...cs, c])}
          onRemove={(id) => setCriteria((cs) => cs.filter((c) => c.id !== id))}
        />
      </div>
      <pre className="mt-6 max-w-4xl overflow-x-auto rounded-lg bg-slate-900 p-4 text-[11px] leading-relaxed text-slate-200">
        {JSON.stringify(criteria, null, 2)}
      </pre>
    </main>
  )
}
