'use client'

import { PoolResultCard, type PoolCardRow } from '@/components/pool/PoolResultCard'
import { PoolSidePane } from '@/components/pool/PoolSidePane'
import fixture from '../candidate-history/fixture.json'

/**
 * DEVELOPMENT ONLY. Pool cards and the side pane, from real histories (names removed),
 * so the pool list can be compared against the candidates list — they should read the
 * same way.
 */
export function PoolListPreview() {
  const src = fixture as { name: string; education: PoolCardRow['education']; experiences: { title: string | null; employer: string | null; start_date: string | null; end_date: string | null; is_current?: boolean | null }[] }[]
  const rows: PoolCardRow[] = src.map((c, i) => ({
    id: String(i),
    display_name: c.name,
    current_title: c.experiences[0]?.title ?? null,
    current_company: c.experiences.find((e) => e.employer)?.employer ?? null,
    location_city: 'Bengaluru', location_region: null, location_country: 'India',
    sources: i === 1 ? ['upload:cv'] : ['vendor:crustdata'],
    employer_disputed: i === 2,
    unlocked: i === 0,
    freshness: (['fresh', 'aging', 'stale', 'unknown'] as const)[i % 4],
    education: c.education,
    recent_roles: c.experiences.slice(0, 3).map((e) => ({
      title: e.title, employer: e.employer, start_date: e.start_date, end_date: e.end_date, is_current: Boolean(e.is_current),
    })),
  }))

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <h1 className="text-xl font-bold text-slate-900">Pool list &amp; side pane</h1>
      <p className="mt-1 text-sm text-slate-500">Real histories, names removed. Logos need a session.</p>
      <div className="mt-6 flex gap-4">
        <div className="min-w-0 flex-1 space-y-2">
          {rows.map((r) => <PoolResultCard key={r.id} row={r} onOpen={() => {}} />)}
        </div>
        <div className="flex flex-col gap-4">
          <div className="rounded-xl border border-slate-200 bg-white"><PoolSidePane unlocked={false} candidateId={null} unlocksLeft={18} unlocking={false} onUnlock={() => {}} /></div>
          <div className="rounded-xl border border-slate-200 bg-white"><PoolSidePane unlocked candidateId="abc" unlocksLeft={18} unlocking={false} onUnlock={() => {}} /></div>
        </div>
      </div>
    </main>
  )
}
