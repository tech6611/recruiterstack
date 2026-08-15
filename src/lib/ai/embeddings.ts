/**
 * Embedding text builders (Component 05, Slice 5c).
 *
 * The strings we turn into vectors for semantic sourcing: a compact profile for a
 * candidate, and the ICP as a query. Pure + tested; the actual embedding call
 * lives in llm.ts (`embedText` / `embedTexts`).
 */

import type { Icp } from '@/lib/types/icp'

type CandidateProfile = {
  current_title: string | null
  current_company: string | null
  skills: string[] | null
}

/** A compact profile string for a candidate. PURE. */
export function candidateEmbeddingText(c: CandidateProfile): string {
  return [c.current_title, c.current_company, (c.skills ?? []).join(', ')]
    .map((s) => (s ?? '').trim())
    .filter(Boolean)
    .join(' · ')
}

/** The ICP as a search query — competencies (with behaviours) + must-haves. PURE. */
export function icpEmbeddingText(icp: Pick<Icp, 'competencies' | 'must_haves'>): string {
  const comps = icp.competencies
    .map((c) => (c.behaviours?.length ? `${c.name}: ${c.behaviours.join('; ')}` : c.name))
    .join(' · ')
  const gates = icp.must_haves.map((g) => g.label).filter(Boolean).join(' · ')
  return [comps, gates].filter(Boolean).join(' · ')
}
