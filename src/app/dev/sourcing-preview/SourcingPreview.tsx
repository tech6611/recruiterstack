'use client'

import { useState } from 'react'
import fixture from './fixture.json'
import { RecruiterBriefCard } from '@/components/req-jobs/RecruiterBriefCard'
import { SearchSpecEditor } from '@/components/req-jobs/SearchSpecEditor'
import { SourcingMatrix, type MatrixMatch } from '@/components/req-jobs/SourcingMatrix'
import { PoolProfilePanel, type PoolProfileDetailView } from '@/components/req-jobs/PoolProfilePanel'
import type { RecruiterBrief } from '@/lib/types/icp'
import type { SearchSpec } from '@/lib/types/search-spec'

const SOURCE_BADGE: Record<string, string> = { 'vendor:crustdata': 'Crustdata', 'upload:cv': 'CV upload', github: 'GitHub' }

export function SourcingPreview() {
  const [briefOpen, setBriefOpen] = useState(false)
  const [corrections, setCorrections] = useState('')
  const [flags, setFlags] = useState<Record<string, { starred?: boolean; hidden?: boolean }>>({})
  const [showHidden, setShowHidden] = useState(false)
  const [openProfile, setOpenProfile] = useState<string | null>(null)
  const brief = (fixture.icp.sourcing_map as { recruiter_brief?: RecruiterBrief | null } | null)?.recruiter_brief ?? null
  const spec = fixture.spec as unknown as SearchSpec
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const all: MatrixMatch[] = (fixture.matches as any[]).map((m) => ({
    candidate_id: m.profile_id, score: m.score,
    gate_failures: (m.gate_failures ?? []).map((label: string) => ({ label })),
    gate_unknown: (m.gate_unknown ?? []).map((label: string) => ({ label })),
    gate_reasons: m.gate_reasons ?? {},
    tags: m.tags ?? [], education_summary: m.education_summary ?? null, experience_years: m.experience_years ?? null, current_tenure_months: m.current_tenure_months ?? null,
    source_badge: (m.sources ?? []).map((k: string) => SOURCE_BADGE[k]).find(Boolean) ?? null,
    level_badge: m.acquired ? `L${m.acquired.level}${m.acquired.level === 1 ? ' · full match' : ''}` : null,
    red_flags: m.red_flags ?? [], rationale: m.rationale ?? null, competencies: m.competencies ?? [],
    unreachable: !m.reachable, skills: m.skills ?? [], decision: null,
    candidate: { id: m.profile_id, name: m.name, current_title: m.current_title, current_company: m.current_company, location: m.location },
    ...(flags[m.profile_id] ?? {}),
  }))
  const hiddenCount = all.filter((m) => m.hidden).length
  const matches = all.filter((m) => showHidden || !m.hidden)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const detail = (fixture as any).profile as PoolProfileDetailView | undefined

  return (
    <div className="mx-auto max-w-6xl space-y-8 p-6">
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
        Development preview · real data from the Strategy &amp; Operations Manager job, rendered from a fixture. Star / hide / columns / evidence / profile panel work locally; Count and Find people are disabled.
      </div>

      <section>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Scoring tab · recruiter brief</h2>
        <RecruiterBriefCard brief={brief} open={briefOpen} onToggle={() => setBriefOpen((v) => !v)}
          corrections={corrections} onCorrectionsChange={setCorrections} onSaveCorrections={() => {}} saving={false} />
      </section>

      <section>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Source tab · search plan + market matrix</h2>
        <SearchSpecEditor jobId="preview" initialSpec={spec} readOnly />
        <div className="mt-3 space-y-2">
          {hiddenCount > 0 && <button type="button" onClick={() => setShowHidden((v) => !v)} className="text-[11px] text-slate-400 hover:text-slate-600">{showHidden ? 'Hide' : 'Show'} {hiddenCount} hidden</button>}
          <SourcingMatrix matches={matches} icp={fixture.columns} selected={new Set()} onToggle={() => {}}
            onStar={(id, starred) => setFlags((f) => ({ ...f, [id]: { ...f[id], starred } }))}
            onHide={(id) => setFlags((f) => ({ ...f, [id]: { ...f[id], hidden: true } }))}
            onOpenProfile={(id) => setOpenProfile(id)} />
          {openProfile && (
            <PoolProfilePanel profileId={openProfile} tags={all.find((m) => m.candidate_id === openProfile)?.tags} onClose={() => setOpenProfile(null)}
              initialDetail={detail && detail.id === openProfile ? detail : { ...(detail as PoolProfileDetailView), id: openProfile, display_name: all.find((m) => m.candidate_id === openProfile)?.candidate?.name ?? null }} />
          )}
        </div>
      </section>
    </div>
  )
}
