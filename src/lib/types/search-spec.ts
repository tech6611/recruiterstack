/**
 * The SEARCH SPEC — the vendor-neutral, recruiter-editable description of who to
 * acquire for a job. It is what the user sees and edits ("Juicebox-style" chips), and
 * what every vendor compiler (Crustdata today; PDL / Coresignal / the client's own
 * pool later) turns into its own query grammar. It never names a vendor.
 *
 * Shape: a ladder. `base` is the must-have line applied to every level; `levels` are
 * searched IN ORDER, each exhausted before the next is opened, and each one names
 * what it gives up versus the level before ("tier-2 schools instead of tier-1").
 * `post_fetch` lists the ICP items no source can search — shown to the user as
 * "verified after fetch", never silently dropped.
 *
 * Stored on the ICP as sourcing_map.search_spec (JSONB, no migration). The brief
 * proposes the first version; recruiter edits win over regeneration until reset.
 */

export type CriterionKind =
  | 'school'            // education.school name terms (tier lists are OUR house knowledge)
  | 'employer_current'  // currently at any of these employers
  | 'employer_past'     // formerly at any of these employers
  | 'employer_any'      // at any point at any of these employers
  | 'title_current'     // current title contains all words of any value
  | 'title_any'         // any role's title contains all words of any value
  | 'seniority'         // vendor closed set; `exclude` flips to "none of these"
  | 'function'          // vendor closed set
  | 'years_band'        // total experience min..max
  | 'grad_year_band'    // highest-degree end year min..max
  | 'degree_field'      // degree and/or field-of-study terms ("B.Tech", "Engineering", "Computer Science")
  | 'location'          // geo radius around values[0]
  | 'skill'             // listed skills (exact, sparse on most sources)
  | 'industry'          // employer industry
  | 'company_size'      // employer headcount band (e.g. 51-200)
  | 'company_type'      // Privately Held / Public Company / Nonprofit …
  | 'funding_stage'     // Seed / Series A … (not every source can filter on it)

export interface SearchCriterion {
  id: string
  kind: CriterionKind
  /** Chip values — the literal terms sent to the source (schools, employers, titles…). */
  values: string[]
  min?: number | null
  max?: number | null
  radius_km?: number | null
  /** seniority/function: exclude these instead of requiring them. */
  exclude?: boolean
  /** Optional human label shown instead of the kind name. */
  label?: string | null
  /**
   * Ideal-profile ladder (docs/ideal-profile-plan.md): the level index (1-based) at
   * which this dimension is loosened — companies 2, titles 3, location 4. Null/absent =
   * never relaxed (years, education). A person bought at level L is expected to miss
   * dimensions with relax_at <= L; that is not a failure to fold away.
   */
  relax_at?: number | null
  /**
   * Set on a plan filter that is a copy of an ideal-profile field (title, companies,
   * location…). Such copies are refreshed from the ICP on every read, so a change on the
   * Scoring tab reaches every level of a saved plan. Shown read-only in the plan editor.
   */
  linked?: boolean
  /** A widened copy of a must-have (e.g. the location at 3× radius): the must-have id it
   *  follows. Its values track that must-have; its own widening (radius) is kept. */
  from?: string | null
  /**
   * The bet this row belongs to (1 = searched first). A bet is a company group and the
   * titles searched THERE — "McKinsey · Bain · BCG as Associate / Consultant". Its two
   * rows (employer + title) share the number. Absent = a row for every bet.
   */
  bet?: number | null
  /** The bet's name, shown on the profile and on its search levels. */
  bet_label?: string | null
  /**
   * The bet's place in the search order, set when the recruiter reorders the bets
   * (absent = its number). `bet` stays the bet's identity.
   */
  bet_order?: number | null
  /**
   * A bet's own version of a shared profile row, placed in that bet's search levels: the
   * id of the shared row it stands in for. The level searches this instead of the shared
   * row (even one on the base line), and a person it finds counts as meeting that row.
   */
  replaces?: string | null
}

export interface SearchLevel {
  id: string
  label: string
  criteria: SearchCriterion[]
  /** What this level gives up versus the previous one. */
  relaxes?: string | null
  rationale?: string | null
  /**
   * A catch-all fallback level (feeder titles at ANY company, or a widened location).
   * It is searched, but it does NOT count toward the "is the search too thin?" reach the
   * adaptive planner measures — otherwise the always-huge catch-alls hide a thin ideal and
   * the planner never widens. See docs/recruiter-brain-sourcing.md.
   */
  fallback?: boolean
  /**
   * An ideal-profile line: the ICP's own must-haves (exact title × ideal company ×
   * location). The Scoring tab owns these — they are rebuilt from the ICP on every read,
   * never taken from a stored plan, so the plan can't drift from the profile. Only the
   * widening levels below them are the plan's own.
   */
  ideal?: boolean
}

export interface PostFetchCheck {
  label: string
  /** judge = Fit Engine reads the fetched profile · screen = ask the candidate · local = computed from stored role history */
  how: 'judge' | 'screen' | 'local'
  note?: string | null
}

export interface SearchSpec {
  version: 1
  /** The must-have line: applied to every level, never relaxed. */
  base: SearchCriterion[]
  /** Searched in order; each exhausted before the next. */
  levels: SearchLevel[]
  post_fetch: PostFetchCheck[]
  /** brief = derived from the ICP's recruiter brief · edited = a recruiter changed it (wins over regeneration). */
  source: 'brief' | 'edited'
  edited_at?: string | null
}

/** Human names for criterion kinds, for chips and summaries. */
export const CRITERION_KIND_LABEL: Record<CriterionKind, string> = {
  school: 'School',
  employer_current: 'Currently at',
  employer_past: 'Formerly at',
  employer_any: 'Ever at',
  title_current: 'Current title',
  title_any: 'Any title held',
  seniority: 'Seniority',
  function: 'Function',
  years_band: 'Years of experience',
  grad_year_band: 'Graduation year',
  degree_field: 'Degree / field',
  location: 'Location',
  skill: 'Listed skill',
  industry: 'Industry',
  company_size: 'Company size',
  company_type: 'Company type',
  funding_stage: 'Funding stage',
}
