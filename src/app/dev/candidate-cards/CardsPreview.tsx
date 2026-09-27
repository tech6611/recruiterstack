'use client'

import { CandidateResultCard } from '@/components/candidates/CandidateResultCard'
import type { CandidateListItem } from '@/lib/types/database'
import fixture from './fixture.json'

/**
 * DEVELOPMENT ONLY. The card view against four real histories from the database
 * (names removed), at the width the candidates list gives it.
 */
export function CardsPreview() {
  const cards = fixture as unknown as CandidateListItem[]
  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="text-xl font-bold text-slate-900">Candidate cards</h1>
      <p className="mt-1 text-sm text-slate-500">
        Four real histories, names removed. Logos need a session, so these show monograms.
      </p>
      <div className="mt-6 space-y-2">
        {cards.map((c) => <CandidateResultCard key={c.id} candidate={c} onOpen={() => {}} />)}
      </div>
    </main>
  )
}
