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

const F = {
  school: 'education.schools.school',
  gradYear: 'education.schools.end_year',
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

/** Compile one criterion, or explain why this source can't. */
export function compileCriterion(c: SearchCriterion): { ok: CompiledCriterion } | { unsupported: string } {
  const vals = c.values.map((v) => v.trim()).filter(Boolean)
  const list = (n = 6) => vals.slice(0, n).join(' / ') + (vals.length > n ? ` +${vals.length - n}` : '')
  switch (c.kind) {
    case 'school':
      return vals.length ? { ok: { conditions: [orAllWords(F.school, vals)], summary: `school: ${list()}` } } : { unsupported: 'no schools listed' }
    case 'employer_current':
      return vals.length ? { ok: { conditions: [orAllWords(F.empCurrent, vals)], summary: `currently at: ${list()}` } } : { unsupported: 'no employers listed' }
    case 'employer_past':
      return vals.length ? { ok: { conditions: [orAllWords(F.empPast, vals)], summary: `formerly at: ${list()}` } } : { unsupported: 'no employers listed' }
    case 'employer_any':
      return vals.length ? { ok: { conditions: [orAllWords(F.empAny, vals)], summary: `ever at: ${list()}` } } : { unsupported: 'no employers listed' }
    case 'title_current':
      return vals.length ? { ok: { conditions: [orAllWords(F.titleCurrent, vals)], summary: `current title: ${list()}` } } : { unsupported: 'no titles listed' }
    case 'title_any':
      return vals.length ? { ok: { conditions: [orAllWords(F.titleAny, vals)], summary: `any title: ${list()}` } } : { unsupported: 'no titles listed' }
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
        ? { ok: { conditions: [{ field: F.location, type: 'geo_distance', value: { location: vals[0], distance: c.radius_km ?? 50, unit: 'km' } }], summary: `within ${c.radius_km ?? 50} km of ${vals[0]}` } }
        : { unsupported: 'no location given' }
    case 'skill':
      return vals.length ? { ok: { conditions: [{ field: F.skills, type: 'in', value: vals }], summary: `lists skill: ${list()}` } } : { unsupported: 'no skills listed' }
    case 'industry':
      return { unsupported: 'employer industry is not a reliable filter on this source yet' }
    case 'company_size':
      return { unsupported: 'employer size is not a reliable filter on this source yet' }
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
}

/** Compile the whole spec: every level becomes a lane carrying the base conditions. */
export function compileSpec(spec: SearchSpec): CompiledSpec {
  const unsupported: CompiledSpec['unsupported'] = []
  const common: SearchPlan['common'] = []
  const baseConds: (CrustdataCondition | CrustdataFilterGroup)[] = []
  for (const c of spec.base) {
    const r = compileCriterion(c)
    if ('ok' in r) {
      baseConds.push(...r.ok.conditions)
      for (const cond of r.ok.conditions) common.push({ label: r.ok.summary, condition: cond as CrustdataCondition })
    } else unsupported.push({ requirement: c.label ?? CRITERION_KIND_LABEL[c.kind], reason: r.unsupported, level: 'base' })
  }

  const lanes: SearchLane[] = []
  spec.levels.forEach((lvl: SearchLevel, i) => {
    const own: (CrustdataCondition | CrustdataFilterGroup)[] = []
    const summary: string[] = []
    for (const c of lvl.criteria) {
      const r = compileCriterion(c)
      if ('ok' in r) { own.push(...r.ok.conditions); summary.push(r.ok.summary) }
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
  }
}
