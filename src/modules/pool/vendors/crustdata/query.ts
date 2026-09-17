/**
 * ICP → Crustdata query translator (Slice 3).
 *
 * Turns a role's Ideal Candidate Profile into a Crustdata /person/search filter
 * group. PURE — no I/O, no network, no clock — so it is exhaustively unit-testable.
 *
 * WHAT IT TRANSLATES, AND WHY ONLY THIS
 * The ICP holds requirements in two shapes:
 *   • must_haves[]        — structured hard gates (attribute / operator / value)
 *   • sourcing_map        — a recruiter's prose decomposition, incl. freetext
 *                           `findable_proxy` strings ("what you'd type in a search box")
 *
 * This translator maps the STRUCTURED must_haves deterministically. It does NOT try to
 * parse freetext findable_proxy into filter grammar — that guessing belongs to an
 * LLM-assisted pass (a later slice), and a wrong hard filter silently hides good
 * candidates. Anything it can't map confidently is returned in `unmapped` so the
 * caller can surface it rather than pretend it was applied.
 *
 * The design split (docs/market-data-vendors-research.md §3): the vendor does COARSE
 * recall on database-field-shaped terms; precision (competencies, unwritten filters,
 * screen_later items) is the local Fit Engine's job AFTER fetch, never the query's.
 * So we deliberately send FEW, high-confidence hard filters and let scoring rank.
 */
import type { Icp, IcpMustHave } from '@/lib/types/icp'
import type { CrustdataCondition, CrustdataFilterGroup } from '@/modules/pool/vendors/crustdata/client'

export type { CrustdataCondition, CrustdataFilterGroup }

export interface CrustdataQueryContext {
  /** The role title (from the job). Becomes an all-words title match when present. */
  title?: string | null
  /** Radius (km) for a location gate given as a city name. Default 50. */
  locationRadiusKm?: number
}

export interface CrustdataQueryBuild {
  filters: CrustdataFilterGroup
  /** Requirements that became a condition, for display/debugging. */
  mapped: { requirement: string; condition: CrustdataCondition }[]
  /** Requirements we deliberately did NOT send, with why. */
  unmapped: { requirement: string; reason: string }[]
}

// ── Crustdata field paths (verified against the live schema, 2025-11-01) ──────────
const FIELD = {
  title: 'experience.employment_details.current.title',
  location: 'professional_network.location.raw',
  years: 'years_of_experience_raw',
  skills: 'skills.professional_network_skills',
  seniority: 'experience.employment_details.current.seniority_level',
  function: 'experience.employment_details.current.function_category',
  company: 'experience.employment_details.current.company_name',
} as const

const DEFAULT_RADIUS_KM = 50

/** Crustdata's closed value set for seniority_level. Filtering on anything else returns nothing. */
const SENIORITY_SET = [
  'Entry Level',
  'Entry Level Manager',
  'Senior',
  'Director',
  'Owner / Partner',
  'CXO',
  'Vice President',
  'In Training',
  'Experienced Manager',
  'Strategic',
] as const

/** Closed value set for function_category. */
const FUNCTION_SET = [
  'Engineering',
  'Sales',
  'Consulting',
  'Marketing',
  'Operations',
  'Finance',
  'Research',
  'Customer Success and Support',
  'Arts and Design',
  'Human Resources',
  'Legal',
  'Product Management',
] as const

/** Common phrasings → the exact closed-set seniority value. */
const SENIORITY_ALIASES: Record<string, (typeof SENIORITY_SET)[number]> = {
  entry: 'Entry Level',
  'entry level': 'Entry Level',
  junior: 'Entry Level',
  senior: 'Senior',
  sr: 'Senior',
  staff: 'Senior',
  lead: 'Senior',
  principal: 'Senior',
  manager: 'Experienced Manager',
  'engineering manager': 'Experienced Manager',
  director: 'Director',
  vp: 'Vice President',
  'vice president': 'Vice President',
  'vice-president': 'Vice President',
  'c-level': 'CXO',
  cxo: 'CXO',
  clevel: 'CXO',
  executive: 'CXO',
  founder: 'Owner / Partner',
  'owner / partner': 'Owner / Partner',
  owner: 'Owner / Partner',
  partner: 'Owner / Partner',
}

const FUNCTION_ALIASES: Record<string, (typeof FUNCTION_SET)[number]> = {
  engineering: 'Engineering',
  eng: 'Engineering',
  software: 'Engineering',
  developer: 'Engineering',
  product: 'Product Management',
  'product management': 'Product Management',
  pm: 'Product Management',
  design: 'Arts and Design',
  'arts and design': 'Arts and Design',
  sales: 'Sales',
  marketing: 'Marketing',
  operations: 'Operations',
  ops: 'Operations',
  finance: 'Finance',
  research: 'Research',
  legal: 'Legal',
  hr: 'Human Resources',
  'human resources': 'Human Resources',
  'people': 'Human Resources',
  'customer success': 'Customer Success and Support',
  'customer support': 'Customer Success and Support',
  support: 'Customer Success and Support',
  consulting: 'Consulting',
}

/** Canonical attribute buckets. Attribute names in must_haves are open-ended freetext. */
type AttributeKind = 'title' | 'location' | 'years' | 'skills' | 'seniority' | 'function' | 'company'

function classifyAttribute(attribute: string): AttributeKind | null {
  const a = attribute.trim().toLowerCase()
  if (/(^|_|\b)(title|role|job[_ ]?title|position)(\b|_|$)/.test(a)) return 'title'
  if (/(location|geo|city|region|based|country)/.test(a)) return 'location'
  if (/(experience|years|tenure|yoe)/.test(a)) return 'years'
  if (/(skill|technology|tech|stack|tool)/.test(a)) return 'skills'
  if (/(seniority|level)/.test(a)) return 'seniority'
  if (/(function|department|team|discipline)/.test(a)) return 'function'
  if (/(company|employer|organization|organisation)/.test(a)) return 'company'
  return null
}

/**
 * Attributes recruiters routinely write whose VALUES don't line up with a Crustdata
 * field — `industry: "b2b saas"` isn't in Crustdata's LinkedIn industry taxonomy;
 * `background: "customer success"` describes a career arc, not a current-title match.
 * Forcing these into hard filters silently drops good people, so we deliberately
 * route them to post-fetch ranking (the Fit Engine) and say so, rather than guessing.
 */
const RANKING_ATTRIBUTE = /(industry|background|domain|sector|vertical|culture|values|mindset|trait)/

function unmappableReason(attribute: string): string {
  const a = attribute.trim().toLowerCase()
  if (RANKING_ATTRIBUTE.test(a)) {
    return `"${attribute}" is better applied as a post-fetch ranking signal — its values rarely match a Crustdata field cleanly`
  }
  return `attribute "${attribute}" has no Crustdata search field`
}

function toStringArray(value: IcpMustHave['value']): string[] {
  if (Array.isArray(value)) return value.map((v) => String(v).trim()).filter(Boolean)
  const s = String(value ?? '').trim()
  return s ? [s] : []
}

function toNumber(value: IcpMustHave['value']): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  const n = Number.parseFloat(String(value ?? ''))
  return Number.isFinite(n) ? n : null
}

/** Numeric comparison operator → Crustdata type. Note Crustdata uses `=>`/`=<`, not `>=`/`<=`. */
function numericType(operator: string): string {
  switch (operator.trim().toLowerCase()) {
    case 'gt':
    case '>':
      return '>'
    case 'lt':
    case '<':
      return '<'
    case 'lte':
    case '<=':
    case '=<':
      return '=<'
    case 'equals':
    case 'eq':
    case '=':
      return '='
    // gte / >= / "min" and anything else: treat as a floor, the usual must-have intent.
    default:
      return '=>'
  }
}

function mapToClosedSet(
  values: string[],
  aliases: Record<string, string>,
  set: readonly string[],
): { matched: string[]; unmatched: string[] } {
  const setLower = new Map(set.map((s) => [s.toLowerCase(), s]))
  const matched = new Set<string>()
  const unmatched: string[] = []
  for (const raw of values) {
    const key = raw.trim().toLowerCase()
    const hit = setLower.get(key) ?? aliases[key]
    if (hit) matched.add(hit)
    else unmatched.push(raw)
  }
  return { matched: Array.from(matched), unmatched }
}

/** Build one condition (or an unmapped reason) from a single must-have. */
function conditionForMustHave(
  mh: IcpMustHave,
  ctx: CrustdataQueryContext,
): { condition: CrustdataCondition } | { reason: string } {
  const kind = classifyAttribute(mh.attribute)
  if (!kind) return { reason: unmappableReason(mh.attribute) }

  switch (kind) {
    case 'title': {
      const v = toStringArray(mh.value)[0]
      return v ? { condition: { field: FIELD.title, type: '(.)', value: v } } : { reason: 'empty title value' }
    }
    case 'location': {
      const v = toStringArray(mh.value)[0]
      if (!v) return { reason: 'empty location value' }
      return {
        condition: {
          field: FIELD.location,
          type: 'geo_distance',
          value: { location: v, distance: ctx.locationRadiusKm ?? DEFAULT_RADIUS_KM, unit: 'km' },
        },
      }
    }
    case 'years': {
      const n = toNumber(mh.value)
      return n != null
        ? { condition: { field: FIELD.years, type: numericType(mh.operator), value: n } }
        : { reason: `experience value "${String(mh.value)}" is not a number` }
    }
    case 'skills': {
      const vals = toStringArray(mh.value)
      return vals.length ? { condition: { field: FIELD.skills, type: 'in', value: vals } } : { reason: 'empty skill list' }
    }
    case 'seniority': {
      const { matched, unmatched } = mapToClosedSet(toStringArray(mh.value), SENIORITY_ALIASES, SENIORITY_SET)
      if (!matched.length) return { reason: `seniority ${JSON.stringify(unmatched)} not in Crustdata's closed set` }
      return { condition: { field: FIELD.seniority, type: 'in', value: matched } }
    }
    case 'function': {
      const { matched, unmatched } = mapToClosedSet(toStringArray(mh.value), FUNCTION_ALIASES, FUNCTION_SET)
      if (!matched.length) return { reason: `function ${JSON.stringify(unmatched)} not in Crustdata's closed set` }
      return { condition: { field: FIELD.function, type: 'in', value: matched } }
    }
    case 'company': {
      const vals = toStringArray(mh.value)
      return vals.length ? { condition: { field: FIELD.company, type: 'in', value: vals } } : { reason: 'empty company list' }
    }
  }
}

/**
 * Build a Crustdata query from an ICP's must-haves plus optional job context.
 *
 * The title comes from `ctx.title` (the job) unless a must-have already supplies one —
 * the ICP itself carries no title field. Returns the filter group plus a mapped /
 * unmapped breakdown; it never throws. An empty `conditions` array is possible (a
 * caller should check `isQueryable` before spending a search on it).
 */
export function buildCrustdataQueryFromIcp(
  icp: Pick<Icp, 'must_haves'> & Partial<Pick<Icp, 'sourcing_map'>>,
  ctx: CrustdataQueryContext = {},
): CrustdataQueryBuild {
  const conditions: CrustdataCondition[] = []
  const mapped: CrustdataQueryBuild['mapped'] = []
  const unmapped: CrustdataQueryBuild['unmapped'] = []
  let hasTitle = false

  for (const mh of icp.must_haves ?? []) {
    const result = conditionForMustHave(mh, ctx)
    if ('condition' in result) {
      conditions.push(result.condition)
      mapped.push({ requirement: mh.label || mh.attribute, condition: result.condition })
      if (result.condition.field === FIELD.title) hasTitle = true
    } else {
      unmapped.push({ requirement: mh.label || mh.attribute, reason: result.reason })
    }
  }

  // The role title is the backbone of a sourcing query. If no must-have supplied one,
  // fall back to the job title from context.
  const ctxTitle = ctx.title?.trim()
  if (!hasTitle && ctxTitle) {
    const condition: CrustdataCondition = { field: FIELD.title, type: '(.)', value: ctxTitle }
    conditions.unshift(condition)
    mapped.unshift({ requirement: `role title: ${ctxTitle}`, condition })
  }

  return { filters: { op: 'and', conditions }, mapped, unmapped }
}

/** A query is worth spending a search on only if it has at least one condition. */
export function isQueryable(build: CrustdataQueryBuild): boolean {
  return build.filters.conditions.length > 0
}
