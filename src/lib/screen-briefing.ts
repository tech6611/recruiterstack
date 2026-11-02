// Pure helpers for POST /api/internal/screen-context — the briefing an AI phone
// call is run from. Kept out of route.ts (Next.js only allows route exports there).
import type { Icp, IcpMustHave } from '@/lib/types/icp'
import { jobWideMustHaves } from '@/lib/icp-gates'

/** The CV portrait only: the first paragraph of the stored candidate summary.
 *  Later paragraphs are activity notes (e.g. "Their AI phone screen encountered a
 *  technical error…") that a caller must not read as facts about the candidate. PURE. */
export function cvSummaryOnly(summary: string | null | undefined): string | null {
  const first = (summary ?? '').split(/\n\s*\n/)[0]?.trim()
  return first || null
}

/** Must-haves a caller should confirm: job-wide HARD gates only. sourcing_only rows
 *  (target employers, schools, titles) guide who we search for and never reject
 *  anyone — a caller asking "are you currently at McKinsey?" would be wrong. PURE. */
export function callerMustHaves(gates: IcpMustHave[] | null | undefined): { label: string }[] {
  return jobWideMustHaves(gates)
    .filter((m) => m.enforcement !== 'sourcing_only')
    .map((m) => ({ label: m.label }))
}

/** The recruiter brain's persona + local market knowledge, trimmed to what a caller
 *  needs — so the call is run by the same specialist recruiter that reasoned the ICP
 *  (niche, market, local norms like notice periods / ESOP, what not to penalise). PURE. */
export function callerBrief(icp: Pick<Icp, 'sourcing_map'> | null | undefined) {
  const b = icp?.sourcing_map?.recruiter_brief
  if (!b) return null
  return {
    niche: b.niche ?? null,
    persona: b.persona ?? null,
    market: b.market ?? null,
    experienceBand: b.experience_band ?? null,
    marketGates: (b.market_gates ?? []).map((g) => ({ requirement: g.requirement, why: g.why ?? null })),
    marketNorms: (b.market_norms ?? []).map((n) => ({ topic: n.topic, norm: n.norm })),
    normalRedFlags: b.normal_red_flags ?? [],
    unsureAbout: b.unsure_about ?? [],
    corrections: b.corrections ?? null,
  }
}
