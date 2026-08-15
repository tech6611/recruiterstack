/**
 * Sourcing pre-filter (Component 05, Slice 5a).
 *
 * A cheap, deterministic recall score used to SHORTLIST candidates before the
 * (expensive, one-LLM-call-each) Fit Engine runs. Keyword overlap between the
 * candidate's skills/title and the ICP's competencies + must-have skills, plus
 * location / experience bonuses. Pure + tested. Semantic recall (embeddings)
 * replaces this in Slice 5c when pools grow.
 */

import type { Candidate } from '@/lib/types/database'
import type { Icp } from '@/lib/types/icp'

type IcpQuery = Pick<Icp, 'competencies' | 'must_haves'>

function tokens(s: string | null | undefined): string[] {
  return (s ?? '')
    .toLowerCase()
    .split(/[^a-z0-9+#.]+/)
    .filter((t) => t.length > 1)
}

/** The keywords the ICP cares about: competency names + must-have skill values. */
export function icpKeywords(icp: IcpQuery): string[] {
  const kw = new Set<string>()
  for (const c of icp.competencies) tokens(c.name).forEach((t) => kw.add(t))
  for (const g of icp.must_haves) {
    if (g.attribute?.toLowerCase() === 'skill') {
      const vals = Array.isArray(g.value) ? g.value : [g.value]
      vals.forEach((v) => tokens(String(v)).forEach((t) => kw.add(t)))
    }
  }
  return Array.from(kw)
}

/** Cheap recall score: keyword overlap + location/experience bonuses. PURE. */
export function overlapScore(candidate: Candidate, icp: IcpQuery): number {
  const hay = new Set([
    ...tokens((candidate.skills ?? []).join(' ')),
    ...tokens(candidate.current_title),
  ])
  let score = icpKeywords(icp).reduce((s, k) => s + (hay.has(k) ? 1 : 0), 0)

  for (const g of icp.must_haves) {
    const attr = g.attribute?.toLowerCase()
    if (attr === 'location' && candidate.location) {
      const loc = candidate.location.toLowerCase()
      const vals = (Array.isArray(g.value) ? g.value : [g.value]).map((v) => String(v).toLowerCase())
      if (vals.some((v) => loc.includes(v) || v.includes(loc))) score += 2
    }
    if (attr === 'min_experience' && candidate.experience_years != null) {
      const m = String(Array.isArray(g.value) ? g.value[0] : g.value).match(/\d+/)
      if (m && candidate.experience_years >= Number(m[0])) score += 1
    }
  }
  return score
}

/** Rank the pool by overlap and take the top `limit` for Fit-Engine scoring. PURE. */
export function rankCandidatesForIcp<T extends Candidate>(candidates: T[], icp: IcpQuery, limit: number): T[] {
  return candidates
    .map((c) => ({ c, s: overlapScore(c, icp) }))
    .sort((a, b) => b.s - a.s)
    .slice(0, limit)
    .map((x) => x.c)
}
