/**
 * ICP → Crustdata SEARCH PLAN (Step 2 of niche-recruiter sourcing).
 *
 * The Slice-3 translator only mapped STRUCTURED must-haves, so a reasoning-first ICP
 * (whose gates are plain sentences) sent nothing but the job title to Crustdata — one
 * query against 14,772 people. This module turns the parts of the ICP a recruiter
 * actually searches on into several small LANES, each a complete Crustdata filter
 * group, run in priority order:
 *
 *   • one FEEDER lane per recruiter-brief feeder pool — employer (any role, past or
 *     current) matched by all-words on the normalised company name, optionally
 *     narrowed to the pool's role types;
 *   • one TITLES lane — the job title + the brief's title families, on the current title;
 *   • a fallback TITLE lane (today's behaviour) when the ICP has no brief.
 *
 * Every lane shares the COMMON conditions: the hiring market as a geo radius (unless
 * remote), a years-of-experience floor parsed from the gates, and any structured gate
 * the Slice-3 translator can still map. Plain-sentence gates are listed as `unmapped`
 * with the honest reason: they are enforced by the Fit Engine after fetch.
 *
 * Grammar verified live 2026-09-17 (see docs/research/crustdata-audit-2026-09-17.md):
 * nested and/or groups, `(.)` all-words on company_name/title (any role or current),
 * `geo_distance` with a location string, `=>` on years_of_experience_raw. `in` is an
 * EXACT whole-string match, so it is never used for names here.
 *
 * PURE — no I/O — so it is exhaustively unit-testable.
 */
import type { Icp, RecruiterBrief } from '@/lib/types/icp'
import type { JobRoleContext } from '@/modules/ats/domain/job-role-context'
import {
  buildCrustdataQueryFromIcp,
  type CrustdataCondition,
  type CrustdataFilterGroup,
} from '@/modules/pool/vendors/crustdata/query'

export type LaneKind = 'feeder' | 'titles' | 'title'

export interface SearchLane {
  /** Stable id (kind + slug + filter hash) — pagination cursors are keyed on it. */
  key: string
  kind: LaneKind
  label: string
  rationale?: string | null
  /** Plain-English chips describing what this lane filters on (for the UI). */
  summary: string[]
  filters: CrustdataFilterGroup
}

export interface SearchPlan {
  lanes: SearchLane[]
  /** Conditions every lane shares, with a label each. */
  common: { label: string; condition: CrustdataCondition }[]
  /** ICP requirements deliberately NOT sent, and why. */
  unmapped: { requirement: string; reason: string }[]
}

export interface SearchPlanContext {
  title?: string | null
  roleContext?: JobRoleContext | null
  /** Radius for the market geo filter. Default 50 km. */
  locationRadiusKm?: number
  /** Cap on feeder lanes (priority order). Default 4. */
  maxFeederLanes?: number
}

const FIELD = {
  anyCompany: 'experience.employment_details.company_name',
  anyTitle: 'experience.employment_details.title',
  currentTitle: 'experience.employment_details.current.title',
  location: 'professional_network.location.raw',
  years: 'years_of_experience_raw',
} as const

const DEFAULT_RADIUS_KM = 50
const DEFAULT_MAX_FEEDER_LANES = 4
const MAX_TERMS_PER_GROUP = 12

const COUNTRY_NAMES: Record<string, string> = {
  IN: 'India', US: 'United States', GB: 'United Kingdom', AE: 'United Arab Emirates', SG: 'Singapore',
  DE: 'Germany', FR: 'France', CA: 'Canada', AU: 'Australia', NL: 'Netherlands', IE: 'Ireland', SA: 'Saudi Arabia',
}

/**
 * Split a recruiter-written company entry into the search terms Crustdata's all-words
 * match needs. "Boston Consulting Group (BCG)" → ["Boston Consulting Group", "BCG"];
 * "McKinsey & Company" → ["McKinsey"]; "Razorpay, CRED" → ["Razorpay", "CRED"]. Legal
 * suffixes are dropped because they rarely appear the same way in the stored name.
 * PURE + tested.
 */
export function companyQueryTerms(entry: string): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  const push = (t: string) => {
    const term = t
      .replace(/(?:\s*&\s*|\s+and\s+)(?:company|co)\b\.?/gi, '')
      .replace(/\b(?:inc|ltd|llp|llc|pvt|corp|plc)\b\.?/gi, '')
      .replace(/\b(?:private\s+limited|limited|corporation|incorporated)\b/gi, '')
      .replace(/[.,;:]+$/g, '')
      .replace(/\s+/g, ' ')
      .trim()
    if (term.length < 2) return
    const k = term.toLowerCase()
    if (!seen.has(k)) { seen.add(k); out.push(term) }
  }
  for (const piece of entry.split(/\s*(?:,|\/|;|\bor\b)\s*/i)) {
    if (!piece.trim()) continue
    const paren = piece.match(/\(([^)]+)\)/)
    push(piece.replace(/\([^)]*\)/g, ''))
    if (paren?.[1]) push(paren[1])
  }
  return out
}

/** Split a role-type entry the same way ("Business Analyst, Associate" → two terms). */
function roleTerms(entry: string): string[] {
  return entry.split(/\s*(?:,|\/|;|\bor\b)\s*/i).map((t) => t.trim()).filter((t) => t.length >= 2)
}

/** A years floor from a plain-sentence gate ("at least 2 full years…", "5+ years"). */
export function yearsFloorFromLabel(label: string): number | null {
  if (!/\b(?:years?|yrs)\b/i.test(label)) return null
  const m = label.match(/(\d+(?:\.\d+)?)\s*\+?\s*(?:full[- ]?time\s+|full\s+)?(?:years?|yrs)/i)
  if (!m) return null
  const n = Number(m[1])
  return Number.isFinite(n) && n > 0 && n < 60 ? n : null
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'lane'
}

/** Tiny stable hash so a lane key changes whenever its filters do. */
function hash(s: string): string {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0
  return (h >>> 0).toString(36)
}

function orAllWords(field: string, terms: string[]): CrustdataFilterGroup {
  return { op: 'or', conditions: terms.slice(0, MAX_TERMS_PER_GROUP).map((value) => ({ field, type: '(.)', value })) }
}

function marketLocation(ctx: SearchPlanContext): string | null {
  const m = ctx.roleContext?.market
  if (!m) return null
  if (m.work_model === 'remote') return null
  const country = m.country ? (COUNTRY_NAMES[m.country.toUpperCase()] ?? m.country) : null
  const parts = [m.city, m.state, country].filter(Boolean)
  if (parts.length) return parts.join(', ')
  return m.site ?? null
}

/** Build the plan. Never throws; a plan with zero lanes means "nothing worth searching". */
export function buildSearchPlan(
  icp: Pick<Icp, 'must_haves'> & Partial<Pick<Icp, 'sourcing_map'>>,
  ctx: SearchPlanContext = {},
): SearchPlan {
  const brief: RecruiterBrief | null | undefined = icp.sourcing_map?.recruiter_brief
  const common: SearchPlan['common'] = []
  const unmapped: SearchPlan['unmapped'] = []

  // Market → geo radius (the location is a SEARCH filter here, never a rejection gate).
  const loc = marketLocation(ctx)
  if (loc) {
    common.push({
      label: `within ${ctx.locationRadiusKm ?? DEFAULT_RADIUS_KM} km of ${loc}`,
      condition: { field: FIELD.location, type: 'geo_distance', value: { location: loc, distance: ctx.locationRadiusKm ?? DEFAULT_RADIUS_KM, unit: 'km' } },
    })
  }

  // Gates: a years floor from plain sentences; structured gates via the Slice-3 mapper;
  // everything else is honestly reported as post-fetch.
  let yearsFloor: number | null = null
  const structured = buildCrustdataQueryFromIcp({ must_haves: icp.must_haves }, {})
  const structuredByReq = new Map(structured.mapped.map((m) => [m.requirement, m.condition]))
  for (const mh of icp.must_haves ?? []) {
    const req = mh.label || mh.attribute
    const cond = structuredByReq.get(req)
    if (cond && cond.field !== FIELD.currentTitle) {
      if (cond.field === FIELD.location && loc) continue // market already covers it
      common.push({ label: req, condition: cond })
      continue
    }
    const floor = yearsFloorFromLabel(mh.label ?? '')
    if (floor != null) {
      yearsFloor = Math.max(yearsFloor ?? 0, floor)
      continue
    }
    unmapped.push({ requirement: req, reason: 'plain-language gate — judged by the Fit Engine after fetch, not searchable' })
  }
  if (yearsFloor != null) {
    common.push({ label: `${yearsFloor}+ years of experience`, condition: { field: FIELD.years, type: '=>', value: yearsFloor } })
  }

  const commonConds = common.map((c) => c.condition)
  const lanes: SearchLane[] = []
  const lane = (kind: LaneKind, label: string, own: (CrustdataCondition | CrustdataFilterGroup)[], summary: string[], rationale?: string | null): SearchLane => {
    const filters: CrustdataFilterGroup = { op: 'and', conditions: [...own, ...commonConds] }
    return { key: `${kind}:${slug(label)}:${hash(JSON.stringify(filters))}`, kind, label, rationale: rationale ?? null, summary, filters }
  }

  // Feeder lanes — where this recruiter looks FIRST.
  const pools = [...(brief?.feeder_pools ?? [])]
    .filter((p) => p.companies?.length)
    .sort((a, b) => (a.priority ?? 99) - (b.priority ?? 99))
    .slice(0, ctx.maxFeederLanes ?? DEFAULT_MAX_FEEDER_LANES)
  for (const pool of pools) {
    const companies = Array.from(new Set(pool.companies.flatMap(companyQueryTerms)))
    if (!companies.length) continue
    const own: (CrustdataCondition | CrustdataFilterGroup)[] = [orAllWords(FIELD.anyCompany, companies)]
    const summary = [`worked at: ${companies.slice(0, MAX_TERMS_PER_GROUP).join(' / ')}`]
    const roles = Array.from(new Set((pool.role_types ?? []).flatMap(roleTerms)))
    if (roles.length && roles.length <= 8) {
      own.push(orAllWords(FIELD.anyTitle, roles))
      summary.push(`as: ${roles.join(' / ')}`)
    }
    lanes.push(lane('feeder', pool.label, own, summary, pool.rationale))
  }

  // Titles lane — the same search under other names.
  const titleTerms = Array.from(new Set([ctx.title?.trim(), ...(brief?.title_families ?? [])].filter((t): t is string => !!t && t.length >= 2)))
  if (titleTerms.length) {
    lanes.push(lane(brief?.title_families?.length ? 'titles' : 'title', brief?.title_families?.length ? 'Title families' : 'Job title', [orAllWords(FIELD.currentTitle, titleTerms)], [`current title: ${titleTerms.join(' / ')}`]))
  }

  return { lanes, common, unmapped }
}

/** True when the plan has at least one lane worth spending a search on. */
export function isPlanRunnable(plan: SearchPlan): boolean {
  return plan.lanes.length > 0
}

/** Compact, JSON-safe description of a plan for run logs and the API. */
export function describePlan(plan: SearchPlan) {
  return {
    lanes: plan.lanes.map((l) => ({ key: l.key, kind: l.kind, label: l.label, summary: l.summary, rationale: l.rationale ?? null })),
    common: plan.common.map((c) => c.label),
    unmapped: plan.unmapped,
  }
}
