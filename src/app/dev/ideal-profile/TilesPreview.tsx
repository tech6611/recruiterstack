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

const START: SearchCriterion[] = [
  { id: 'a', kind: 'location', values: ['San Francisco, California, United States'], radius_km: 50, relax_at: null },
  { id: 'b', kind: 'years_band', values: [], min: 6, max: 12, relax_at: null },
  { id: 'c', kind: 'title_current', values: ['Engineering Manager', 'Software Engineering Manager'], relax_at: 2 },
  { id: 'd', kind: 'employer_any', values: ['Rippling', 'Ramp', 'Deel'], relax_at: 3 },
  { id: 'e', kind: 'industry', values: [], relax_at: null },
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
