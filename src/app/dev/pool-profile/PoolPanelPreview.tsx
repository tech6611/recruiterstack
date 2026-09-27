'use client'

import { PoolProfilePanel, type PoolProfileDetailView } from '@/components/req-jobs/PoolProfilePanel'
import { ProfileIdentity } from '@/components/candidates/ProfileIdentity'
import { ProfileDocument } from '@/components/candidates/ProfileDocument'
import { PoolSidePane } from '@/components/pool/PoolSidePane'
import type { CompanyFactsMap } from '@/lib/company-facts'
import fixture from '../candidate-history/fixture.json'

/** Real rows from company_facts, so the chips here are the chips production shows. */
const COMPANIES: CompanyFactsMap = {
  flipkart:   { name_norm: 'flipkart',   display_name: 'Flipkart',   industries: ['e-commerce'], employees: 22000, founded_year: 2007, latest_stage: 'Series J' },
  shadowfax:  { name_norm: 'shadowfax',  display_name: 'Shadowfax',  industries: ['Logistics', 'E-commerce logistics', 'Quick commerce'], employees: 4207, founded_year: 2015, latest_stage: null },
  signoz:     { name_norm: 'signoz',     display_name: 'SigNoz',     industries: ['Software Development', 'Developer Tools', 'Observability'], employees: 44, founded_year: 2021, latest_stage: 'Seed' },
}

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
      {/* The WIDE drawer, as /pool renders it: fixed identity block, profile, side pane. */}
      <section className="mt-8 max-w-5xl">
        <h2 className="mb-2 text-sm font-semibold text-slate-900">/pool drawer — locked</h2>
        <div className="flex rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="min-w-0 flex-1 p-6">
            <ProfileIdentity
              name={detail.display_name ?? ''}
              location="Bengaluru, India"
              currentCompany={detail.current_company}
              education={detail.education}
              contacts={[]}
              lockedNote="Contacts after unlock"
              onClose={() => {}}
            />
            <ProfileDocument
              experiences={detail.experiences.map((e) => ({
                title: e.title ?? null,
                employer: e.employer ?? null,
                location: e.location ?? null,
                start_date: e.start_date ?? null,
                end_date: e.end_date ?? null,
                is_current: Boolean(e.is_current),
                summary: e.summary ?? null,
              }))}
              education={detail.education}
              skills={detail.skills}
              companies={COMPANIES}
            />
          </div>
          <PoolSidePane unlocked={false} candidateId={null} unlocksLeft={12} unlocking={false} onUnlock={() => {}} />
        </div>
      </section>

      <section className="mt-8 max-w-5xl">
        <h2 className="mb-2 text-sm font-semibold text-slate-900">Identity block — with links</h2>
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <ProfileIdentity
            name="Jeevan Shankar"
            location="Edison, California, United States"
            currentCompany="Rippling"
            education={[{ school: 'University of Massachusetts Amherst', year: 2014 }]}
            contacts={[
              { kind: 'linkedin', value: 'https://www.linkedin.com/in/jeevanshankar' },
              { kind: 'website', value: 'https://github.com/jeevanshankar' },
              { kind: 'website', value: 'https://x.com/jeevanshankar' },
              { kind: 'website', value: 'jeevanshankar.com' },
              { kind: 'email', value: 'jeevan@example.com' },
            ]}
          />
        </div>
      </section>

      <section className="mt-8 max-w-sm">
        <h2 className="mb-2 text-sm font-semibold text-slate-900">Side pane — unlocked</h2>
        <p className="mb-2 text-xs text-slate-500">
          Tabs only; the panes fetch live candidate data, which this fixture has none of.
        </p>
        <div className="flex h-96 rounded-xl border border-slate-200 bg-white shadow-sm">
          <PoolSidePane
            unlocked
            candidateId="00000000-0000-0000-0000-000000000000"
            unlocksLeft={null}
            unlocking={false}
            onUnlock={() => {}}
          />
        </div>
      </section>

      <PoolProfilePanel profileId="fixture" tags={['Fast career growth']} onClose={() => {}} initialDetail={detail} />
    </main>
  )
}
