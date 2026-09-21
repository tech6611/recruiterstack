/**
 * Compile a vendor-neutral SEARCH SPEC into Crustdata lanes. One of N compilers
 * (PDL / Coresignal / the client's own pool later). A criterion this source cannot
 * express is returned in `unsupported` — shown to the user as "checked after fetch on
 * this source", never silently dropped. PURE + tested.
 *
 * Field paths and condition types verified live 2026-09-18 (178 filterable fields).
 */
import type { SearchCriterion, SearchLevel, SearchSpec } from '@/lib/types/search-spec'
import { CRITERION_KIND_LABEL } from '@/lib/types/search-spec'
import type { CrustdataCondition, CrustdataFilterGroup } from '@/modules/pool/vendors/crustdata/client'
import { mapSeniorityValues, mapFunctionValues } from '@/modules/pool/vendors/crustdata/query'
import type { SearchLane, SearchPlan } from '@/modules/pool/vendors/crustdata/search-plan'
import { isGenericTitleTerm } from '@/lib/ai/gate-evaluator'

const F = {
  headcountCurrent: 'experience.employment_details.current.company_headcount_range',
  industriesCurrent: 'experience.employment_details.current.company_industries',
  companyTypeCurrent: 'experience.employment_details.current.company_type',
  school: 'education.schools.school',
  gradYear: 'education.schools.end_year',
  degree: 'education.schools.degree',
  fieldOfStudy: 'education.schools.field_of_study',
  empCurrent: 'experience.employment_details.current.company_name',
  empPast: 'experience.employment_details.past.company_name',
  empAny: 'experience.employment_details.company_name',
  titleCurrent: 'experience.employment_details.current.title',
  titleAny: 'experience.employment_details.title',
  seniority: 'experience.employment_details.current.seniority_level',
  fn: 'experience.employment_details.current.function_category',
  years: 'years_of_experience_raw',
  location: 'professional_network.location.raw',
  skills: 'skills.professional_network_skills',
} as const

const MAX_TERMS = 40

export interface CompiledCriterion {
  conditions: (CrustdataCondition | CrustdataFilterGroup)[]
  /** Plain-English chip for the lane summary. */
  summary: string
}

function orAllWords(field: string, values: string[]): CrustdataFilterGroup {
  return { op: 'or', conditions: values.slice(0, MAX_TERMS).map((value) => ({ field, type: '(.)', value })) }
}
/** Exclusion of text terms: every value must be absent — Crustdata's "(!)" fuzzy negation, ANDed. */
function noneOf(field: string, values: string[]): CrustdataCondition[] {
  return values.slice(0, MAX_TERMS).map((value) => ({ field, type: '(!)', value }))
}
/** Include → an OR group of all-words matches; exclude → ANDed negations. */
function textMatch(field: string, c: SearchCriterion, vals: string[], noun: string, list: string): CompiledCriterion {
  return c.exclude
    ? { conditions: noneOf(field, vals), summary: `not ${noun}: ${list}` }
    : { conditions: [orAllWords(field, vals)], summary: `${noun}: ${list}` }
}

/** Compile one criterion, or explain why this source can't. */
export function compileCriterion(c: SearchCriterion): { ok: CompiledCriterion } | { unsupported: string } {
  const vals = c.values.map((v) => v.trim()).filter(Boolean)
  const list = (n = 6) => vals.slice(0, n).join(' / ') + (vals.length > n ? ` +${vals.length - n}` : '')
  switch (c.kind) {
    case 'school':
      return vals.length ? { ok: textMatch(F.school, c, vals, 'school', list()) } : { unsupported: 'no schools listed' }
    case 'employer_current':
      return vals.length ? { ok: textMatch(F.empCurrent, c, vals, 'currently at', list()) } : { unsupported: 'no employers listed' }
    case 'employer_past':
      return vals.length ? { ok: textMatch(F.empPast, c, vals, 'formerly at', list()) } : { unsupported: 'no employers listed' }
    case 'employer_any':
      return vals.length ? { ok: textMatch(F.empAny, c, vals, 'ever at', list()) } : { unsupported: 'no employers listed' }
    case 'degree_field': {
      // "Engineering" should match a B.Tech in Engineering whether the vendor put the word
      // in the degree or the field — one OR group across both education fields.
      if (!vals.length) return { unsupported: 'no degree / field terms listed' }
      if (c.exclude) return { ok: { conditions: [...noneOf(F.degree, vals), ...noneOf(F.fieldOfStudy, vals)], summary: `not degree / field: ${list()}` } }
      const both = [...vals.map((value) => ({ field: F.degree, type: '(.)' as const, value })), ...vals.map((value) => ({ field: F.fieldOfStudy, type: '(.)' as const, value }))]
      return { ok: { conditions: [{ op: 'or', conditions: both.slice(0, MAX_TERMS) }], summary: `degree / field: ${list()}` } }
    }
    case 'title_current':
    case 'title_any': {
      // A level word alone ("Senior", "Manager") matches any title that contains it — that
      // is how one stray term bought seven non-engineers. Whole phrases only on an include;
      // an exclusion ("no Interns") is safe and intentionally broad.
      const generic = c.exclude ? [] : vals.filter(isGenericTitleTerm)
      const titles = c.exclude ? vals : vals.filter((v) => !isGenericTitleTerm(v))
      if (!titles.length) return { unsupported: vals.length ? `title terms too generic to search on: ${generic.join(', ')}` : 'no titles listed' }
      const field = c.kind === 'title_current' ? F.titleCurrent : F.titleAny
      const noun = c.kind === 'title_current' ? 'current title' : 'any title'
      return { ok: textMatch(field, c, titles, noun, titles.join(' / ')) }
    }
    case 'seniority': {
      const { matched, unmatched } = mapSeniorityValues(vals)
      if (!matched.length) return { unsupported: `seniority ${JSON.stringify(unmatched)} not in this source's closed set` }
      return { ok: { conditions: [{ field: F.seniority, type: c.exclude ? 'not_in' : 'in', value: matched }], summary: `${c.exclude ? 'not ' : ''}seniority: ${matched.join(' / ')}` } }
    }
    case 'function': {
      const { matched, unmatched } = mapFunctionValues(vals)
      if (!matched.length) return { unsupported: `function ${JSON.stringify(unmatched)} not in this source's closed set` }
      return { ok: { conditions: [{ field: F.fn, type: c.exclude ? 'not_in' : 'in', value: matched }], summary: `${c.exclude ? 'not ' : ''}function: ${matched.join(' / ')}` } }
    }
    case 'years_band': {
      const conds: CrustdataCondition[] = []
      if (c.min != null) conds.push({ field: F.years, type: '=>', value: c.min })
      if (c.max != null) conds.push({ field: F.years, type: '=<', value: c.max })
      if (!conds.length) return { unsupported: 'no years given' }
      return { ok: { conditions: conds, summary: c.min != null && c.max != null ? `${c.min}–${c.max} years` : c.min != null ? `${c.min}+ years` : `≤ ${c.max} years` } }
    }
    case 'grad_year_band': {
      const conds: CrustdataCondition[] = []
      if (c.min != null) conds.push({ field: F.gradYear, type: '=>', value: c.min })
      if (c.max != null) conds.push({ field: F.gradYear, type: '=<', value: c.max })
      if (!conds.length) return { unsupported: 'no years given' }
      return { ok: { conditions: conds, summary: `graduated ${c.min ?? '…'}–${c.max ?? '…'}` } }
    }
    case 'location':
      return vals[0]
        ? { ok: { conditions: [{ field: F.location, type: c.exclude ? 'geo_exclude' : 'geo_distance', value: { location: vals[0], distance: c.radius_km ?? 50, unit: 'km' } }], summary: `${c.exclude ? 'not ' : ''}within ${c.radius_km ?? 50} km of ${vals[0]}` } }
        : { unsupported: 'no location given' }
    case 'skill':
      return vals.length ? { ok: { conditions: [{ field: F.skills, type: c.exclude ? 'not_in' : 'in', value: vals }], summary: `${c.exclude ? 'does not list' : 'lists'} skill: ${list()}` } } : { unsupported: 'no skills listed' }
    case 'industry':
      // Employer industry text (e.g. "Software Development", "Financial Services"), current role.
      return vals.length ? { ok: textMatch(F.industriesCurrent, c, vals, 'industry', list()) } : { unsupported: 'no industries listed' }
    case 'company_size':
      // Headcount bands as stored by the source: 1-10, 11-50, 51-200, 201-500, 501-1000, 1001-5000, 5001-10000, 10001+
      return vals.length ? { ok: { conditions: [{ field: F.headcountCurrent, type: c.exclude ? 'not_in' : 'in', value: vals }], summary: `${c.exclude ? 'not ' : ''}company size: ${list()}` } } : { unsupported: 'no size bands listed' }
    case 'company_type':
      return vals.length ? { ok: { conditions: [{ field: F.companyTypeCurrent, type: c.exclude ? 'not_in' : 'in', value: vals }], summary: `${c.exclude ? 'not ' : ''}company type: ${list()}` } } : { unsupported: 'no company types listed' }
    case 'funding_stage':
      return { unsupported: 'this source cannot filter people by their employer\'s funding stage' }
  }
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'level'
}
function hash(s: string): string {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0
  return (h >>> 0).toString(36)
}

export interface CompiledSpec extends SearchPlan {
  /** Criteria this source can't express, per level ('base' for the must-have line). */
  unsupported: { requirement: string; reason: string; level?: string }[]
  /** Base-line criteria that DID compile — every person this plan buys was filtered on them. */
  baseCriterionIds: string[]
}

/** Compile the whole spec: every level becomes a lane carrying the base conditions. */
export function compileSpec(spec: SearchSpec): CompiledSpec {
  const unsupported: CompiledSpec['unsupported'] = []
  const common: SearchPlan['common'] = []
  const baseConds: (CrustdataCondition | CrustdataFilterGroup)[] = []
  const baseCriterionIds: string[] = []
  // One years band per query: the brief and a must-have can both carry it.
  const seenKinds = new Set<string>()
  for (const c of spec.base) {
    if (c.kind === 'years_band') { if (seenKinds.has(c.kind)) continue; seenKinds.add(c.kind) }
    const r = compileCriterion(c)
    if ('ok' in r) {
      baseConds.push(...r.ok.conditions)
      baseCriterionIds.push(c.id)
      for (const cond of r.ok.conditions) common.push({ label: r.ok.summary, condition: cond as CrustdataCondition })
    } else unsupported.push({ requirement: c.label ?? CRITERION_KIND_LABEL[c.kind], reason: r.unsupported, level: 'base' })
  }

  const lanes: SearchLane[] = []
  spec.levels.forEach((lvl: SearchLevel, i) => {
    const own: (CrustdataCondition | CrustdataFilterGroup)[] = []
    const summary: string[] = []
    const criterionIds: string[] = []
    for (const c of lvl.criteria) {
      const r = compileCriterion(c)
      if ('ok' in r) { own.push(...r.ok.conditions); summary.push(r.ok.summary); criterionIds.push(c.id) }
      else unsupported.push({ requirement: c.label ?? `${CRITERION_KIND_LABEL[c.kind]}: ${c.values.join(', ')}`, reason: r.unsupported, level: lvl.label })
    }
    if (!own.length) return // a level with nothing this source can search is skipped (reported above)
    const filters: CrustdataFilterGroup = { op: 'and', conditions: [...own, ...baseConds] }
    lanes.push({
      key: `L${i + 1}:${slug(lvl.label)}:${hash(JSON.stringify(filters))}`,
      kind: 'level',
      label: lvl.label,
      rationale: lvl.relaxes ? `Relaxes: ${lvl.relaxes}` : lvl.rationale ?? null,
      summary,
      filters,
      criterionIds,
    })
  })

  return {
    lanes,
    common,
    unmapped: [
      ...unsupported.map((u) => ({ requirement: u.requirement, reason: `${u.reason}${u.level ? ` (${u.level})` : ''}` })),
      ...spec.post_fetch.map((p) => ({ requirement: p.label, reason: p.how === 'local' ? 'computed from stored role history after fetch' : p.how === 'screen' ? 'asked in the screen' : 'judged by the Fit Engine after fetch' })),
    ],
    unsupported,
    baseCriterionIds,
  }
}
