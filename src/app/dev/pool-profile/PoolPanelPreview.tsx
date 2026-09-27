'use client'

import { PoolProfilePanel, type PoolProfileDetailView } from '@/components/req-jobs/PoolProfilePanel'
import fixture from '../candidate-history/fixture.json'

/**
 * DEVELOPMENT ONLY. The pool drawer against a real history from the database (name
 * removed), so the pool and the ATS profile can be compared side by side — they should
 * describe the same person the same way.
 */
export function PoolPanelPreview() {
  const c = (fixture as { name: string; education: PoolProfileDetailView['education']; experiences: PoolProfileDetailView['experiences']; skills: string[] }[])[0]
  const detail: PoolProfileDetailView = {
    id: 'fixture',
    display_name: c.name,
    current_title: c.experiences[0]?.title ?? null,
    current_company: c.experiences.find((e) => e.employer)?.employer ?? null,
    location_city: 'Bengaluru',
    location_country: 'India',
    experience_years: 6,
    skills: c.skills ?? [],
    sources: ['vendor:crustdata'],
    education: c.education,
    experiences: c.experiences,
    unlocked: false,
  }
  return (
    <main className="px-6 py-10">
      <h1 className="text-xl font-bold text-slate-900">Pool profile drawer</h1>
      <p className="mt-1 max-w-xl text-sm text-slate-500">
        One real history, name removed. The drawer now renders the same timeline, education
        list and Skill Map as the ATS profile, so an unlocked candidate doesn&rsquo;t change shape.
      </p>
      <PoolProfilePanel profileId="fixture" tags={['Fast career growth']} onClose={() => {}} initialDetail={detail} />
    </main>
  )
}
