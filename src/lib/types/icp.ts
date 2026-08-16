// Ideal Candidate Profile (ICP) — the living, versioned "who's great for this
// role" object (migration 104_icp.sql). Not yet in the generated Supabase types,
// so these interfaces are the source of truth for the `icps` table shape.
//
// The key design fact: IcpCompetency is a SUPERSET of ScoringCriterion (same
// id/name/weight), so an ICP down-projects losslessly to the flat rubric the
// existing Sifter reads — see icpToScoringCriteria() in src/lib/scoring.ts.

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
  attribute: string // 'location' | 'min_experience' | 'skill' | 'seniority' | ...
  operator: string // 'equals' | 'gte' | 'includes' | 'one_of'
  value: string | number | string[]
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
 * The reasoning behind an ICP (Sourcing Brain, Slice 1) — how a recruiter dissected
 * the JD. Explains the ICP and drives sourcing. Stored on the ICP; regenerated with it.
 */
export interface SourcingMap {
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
