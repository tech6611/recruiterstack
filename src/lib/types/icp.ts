// Ideal Candidate Profile (ICP) — the living, versioned "who's great for this
// role" object (migration 104_icp.sql). Not yet in the generated Supabase types,
// so these interfaces are the source of truth for the `icps` table shape.
//
// The key design fact: IcpCompetency is a SUPERSET of ScoringCriterion (same
// id/name/weight), so an ICP down-projects losslessly to the flat rubric the
// existing Sifter reads — see icpToScoringCriteria() in src/lib/scoring.ts.

import type { CriterionKind } from '@/lib/types/search-spec'

export type IcpStatus = 'draft' | 'approved' | 'superseded'
export type IcpSource = 'seed' | 'intake' | 'refinement' | 'manual' | 'template'

/**
 * A hard gate. Applied BEFORE weighted scoring — a candidate who fails any
 * must-have is filtered out, never averaged in. (Enforcement lands in the Fit
 * Engine, Component 06; in Slice 1a these are stored but not yet applied.)
 */
export interface IcpMustHave {
  id: string
  label: string // human phrasing, e.g. "5+ years backend"
  attribute: string // 'location' | 'min_experience' | 'skill' | 'seniority' | ... | 'screening' (not verifiable from a profile)
  operator: string // 'equals' | 'gte' | 'includes' | 'one_of' | 'criterion'
  value: string | number | string[]
  // ── Structured form (docs/structured-must-haves-plan.md) ──────────────────────
  // When `kind` is set this must-have IS a SearchCriterion: the same object the search
  // plan sends to a vendor, checked deterministically by the gate evaluator. The legacy
  // fields above stay populated (attribute = kind, operator = 'criterion') so every
  // existing reader keeps working. `toCriterion()` / `isCriterion()` in
  // src/lib/ai/gate-evaluator.ts are the accessors.
  kind?: CriterionKind
  values?: string[]
  min?: number | null
  max?: number | null
  radius_km?: number | null
  exclude?: boolean
  /** Ideal-profile ladder: level at which this dimension is loosened (see SearchCriterion.relax_at). */
  relax_at?: number | null
}

/** The evaluator's answer for one structured must-have. */
export interface GateVerdict {
  id: string
  kind: CriterionKind
  label: string
  /** null = unverified — the profile has no data for this kind. Never a failure. */
  pass: boolean | null
  /** 'vendor' = the criterion was in the query that bought this person, so it holds by construction. */
  verified_by: 'data' | 'vendor' | null
  reason: string
}

/**
 * A weighted competency = ScoringCriterion (id/name/weight) + behaviours/anchors.
 * `anchors` describe what each 1–4 rating "sounds like", reusing the exact scale
 * the Sifter and manual scorecards already use.
 */
export interface IcpCompetency {
  id: string // reuse ScoringCriterion ids: 'technical', 'experience', ...
  name: string
  weight: number // 1–100; competencies sum to 100
  description?: string
  verbatim?: string // the hiring manager's exact phrasing, when captured
  behaviours: string[] // 0–7 concrete, observable behaviours
  anchors?: { '1': string; '2': string; '3': string; '4': string }
}

export interface IcpChangelogEntry {
  version: number
  change: string
  by?: string
  at: string // ISO timestamp
}

/**
 * The recruiter brief (Phase 1 of "niche recruiter" ICPs). Before reasoning about
 * the role, the model decides WHICH specialist recruiter it is for this search — the
 * niche, the market, the company — and writes down the house knowledge that persona
 * works from: where to look first, what is a true gate in this market, how JD phrases
 * translate here, market norms. Everything downstream (weights, archetypes, gates)
 * is reasoned in that persona. Stored on the ICP so the persona is decided once per
 * job and reused; `corrections` is the recruiter's own overrides, carried across
 * regenerations and fed back into the prompt as house knowledge.
 */
export interface RecruiterBrief {
  /** The precise niche, e.g. "Strategy & Operations / BizOps recruiter, Bengaluru". */
  niche: string
  /** 1–2 sentences: who this recruiter is and what they screen on first. */
  persona: string
  /** The hiring market as understood: city/country, work model, relocation/visa realism. */
  market?: string | null
  /**
   * The realistic experience band for THIS role — floor AND ceiling. A Bain partner
   * with 12 years is not a candidate for a 2–6 year Strategy & Ops seat: over-seniority
   * is a mismatch (won't take it, won't stay, out of budget), not a bonus. Becomes a
   * structured `experience_band` gate, a Crustdata filter, and a deterministic reject.
   */
  experience_band?: { min_years?: number | null; max_years?: number | null; rationale?: string | null } | null
  /**
   * The school lists this recruiter treats as tier-1 / tier-2 for THIS market — house
   * knowledge, not vendor data (no source knows what "tier 1" means). Literal search
   * terms; a generic institution name covers every campus.
   */
  target_schools?: { tier1: string[]; tier2: string[] } | null
  /** Where to search FIRST, in priority order — named employers + role types. */
  feeder_pools: {
    label: string
    companies: string[]
    role_types: string[]
    priority?: number | null
    rationale?: string | null
  }[]
  /** Titles that are the same search as this role. */
  title_families: string[]
  /** The ideal profile's education row: degree terms and/or fields of study ("B.Tech", "Engineering"). */
  education?: { degrees: string[]; fields: string[]; rationale?: string | null } | null
  /** Titles one step wider than title_families — what L3 of the ladder searches. */
  adjacent_titles?: string[]
  /** Which requirements are TRUE gates in this market, and why. */
  market_gates: { requirement: string; why?: string | null }[]
  /** How JD phrases translate for this market ("2:1" → "tier-1 institute" in India). */
  jd_translations: { phrase: string; means_here: string }[]
  /** Comp sanity, notice periods, visa/relocation, title inflation, findability. */
  market_norms: { topic: string; norm: string }[]
  /** Patterns that look bad elsewhere but are normal in this niche — don't penalise. */
  normal_red_flags: string[]
  /** Where the model wants a human to check its assumptions. */
  unsure_about: string[]
  /** The recruiter's corrections to the brief — house knowledge that overrides defaults. */
  corrections?: string | null
}

/**
 * The reasoning behind an ICP (Sourcing Brain, Slice 1) — how a recruiter dissected
 * the JD. Explains the ICP and drives sourcing. Stored on the ICP; regenerated with it.
 */
export interface SourcingMap {
  /** Which specialist recruiter reasoned this ICP, and their house knowledge (Phase 1). */
  recruiter_brief?: RecruiterBrief | null
  /** The recruiter-edited acquisition ladder (vendor-neutral). Absent = derive from the brief. */
  search_spec?: import('@/lib/types/search-spec').SearchSpec | null
  /** The "why this ICP" narrative — what the role really is and how it was weighted. */
  reasoning: string
  /** Every requirement resolved into one of three buckets. */
  requirement_decomposition: {
    requirement: string
    bucket: 'hard_filter' | 'ranking_signal' | 'screen_later'
    findable_proxy?: string | null
    notes?: string | null
  }[]
  /** Filters that drive rejection but appear nowhere in the JD — inferred. */
  unwritten_filters: {
    filter: string
    type?: string | null
    inferred_from?: string | null
    confidence?: number | null
    exclusion_cost?: string | null
    recommend_apply?: boolean
  }[]
  /** 2–4 distinct candidate archetypes ("bets"), incl. a non-obvious one (Slice 2). */
  archetypes?: {
    name: string
    thesis: string
    where_from?: string | null      // career path / employer patterns
    why_interested?: string | null
    why_no?: string | null
    is_non_obvious?: boolean
    hire_risk?: string | null
  }[]
  generated_at?: string
}

export interface Icp {
  id: string
  org_id: string
  job_id: string
  version: number
  status: IcpStatus
  source: IcpSource
  must_haves: IcpMustHave[]
  competencies: IcpCompetency[]
  sourcing_map?: SourcingMap | null
  changelog: IcpChangelogEntry[]
  supersedes_id: string | null
  created_by: string | null
  approved_by: string | null
  approved_at: string | null
  created_at: string
  updated_at: string
}

/** The editable payload for a draft ICP (create / update). */
export type IcpDraftInput = Pick<Icp, 'must_haves' | 'competencies'> &
  Partial<Pick<Icp, 'source'>>

/**
 * A saved, reusable role calibration (Component 02 — Recruiting Knowledge). It's an
 * ICP snapshot (gates + competencies) detached from any one job, so a new req can
 * start from a proven calibration instead of a cold JD-derived seed.
 */
export interface RoleTemplate {
  id: string
  org_id: string
  name: string
  description: string | null
  must_haves: IcpMustHave[]
  competencies: IcpCompetency[]
  source_job_id: string | null
  created_by: string | null
  created_at: string
}
