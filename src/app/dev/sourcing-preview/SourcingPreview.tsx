'use client'

import { useState } from 'react'
import fixture from './fixture.json'
import { RecruiterBriefCard } from '@/components/req-jobs/RecruiterBriefCard'
import { SearchSpecEditor } from '@/components/req-jobs/SearchSpecEditor'
import { SourcingMatrix, type MatrixMatch } from '@/components/req-jobs/SourcingMatrix'
import type { RecruiterBrief } from '@/lib/types/icp'
import type { SearchSpec } from '@/lib/types/search-spec'

const SOURCE_BADGE: Record<string, string> = { 'vendor:crustdata': 'Crustdata', 'upload:cv': 'CV upload', github: 'GitHub' }

export function SourcingPreview() {
  const [briefOpen, setBriefOpen] = useState(false)
  const [corrections, setCorrections] = useState('')
  const brief = (fixture.icp.sourcing_map as { recruiter_brief?: RecruiterBrief | null } | null)?.recruiter_brief ?? null
  const spec = fixture.spec as unknown as SearchSpec
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const matches: MatrixMatch[] = (fixture.matches as any[]).map((m) => ({
    candidate_id: m.profile_id, score: m.score,
    gate_failures: (m.gate_failures ?? []).map((label: string) => ({ label })),
    gate_unknown: (m.gate_unknown ?? []).map((label: string) => ({ label })),
    source_badge: (m.sources ?? []).map((k: string) => SOURCE_BADGE[k]).find(Boolean) ?? null,
    level_badge: m.acquired ? `L${m.acquired.level}${m.acquired.level === 1 ? ' · full match' : ''}` : null,
    red_flags: m.red_flags ?? [], rationale: m.rationale ?? null, competencies: m.competencies ?? [],
    unreachable: !m.reachable, skills: m.skills ?? [], decision: null,
    candidate: { id: m.profile_id, name: m.name, current_title: m.current_title, current_company: m.current_company, location: m.location },
  }))

  return (
    <div className="mx-auto max-w-6xl space-y-8 p-6">
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
        Development preview · real data from the Strategy &amp; Operations Manager job, rendered from a fixture. Buttons that need the server are disabled.
      </div>

      <section>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Scoring tab · recruiter brief (collapsed by default)</h2>
        <RecruiterBriefCard brief={brief} open={briefOpen} onToggle={() => setBriefOpen((v) => !v)}
          corrections={corrections} onCorrectionsChange={setCorrections} onSaveCorrections={() => {}} saving={false} />
      </section>

      <section>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Source tab · search plan (collapsed by default) + market matrix</h2>
        <SearchSpecEditor jobId="preview" initialSpec={spec} readOnly />
        <div className="mt-3">
          <SourcingMatrix matches={matches} icp={fixture.columns} selected={new Set()} onToggle={() => {}} />
        </div>
      </section>
    </div>
  )
}
