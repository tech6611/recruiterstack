/**
 * The ideal-candidate PERSONA, broken into the six Juicebox-style tabs
 * (Current employers · Job titles · Skills · Seniority · Years of experience ·
 * Locations). Pure and vendor-neutral: it reads the job's ideal profile (the
 * SearchSpec ladder) for the TARGETED values, and the pool facets for the
 * DISTRIBUTION actually present today ("the market map"). No I/O — the API route
 * feeds it a spec + facets and ships the result to the tabs component.
 *
 * "Ideal" values come from the base line + level 1 of the ladder. Values that only
 * appear at a widened level (companies at L2, titles at L3, location at L4) are
 * marked `relaxed` so the UI can show them as "also considering", not core.
 */
import type { SearchSpec, SearchCriterion, CriterionKind } from '@/lib/types/search-spec'

export type PersonaTabKey = 'employers' | 'titles' | 'skills' | 'seniority' | 'years' | 'locations'

export interface PersonaChip {
  label: string
  /** People in the pool matching this value — employers/titles only; null when unknown. */
  count?: number | null
  /** True when this value only appears at a widened (relaxed) ladder level. */
  relaxed?: boolean
  /** True when the criterion excludes this value ("not at BigCo"). */
  exclude?: boolean
}

export interface PersonaTab {
  key: PersonaTabKey
  label: string
  /** Short phrase for the tab header, e.g. "6–12 years" or "5 companies". */
  summary: string
  /** The targeted values from the ideal profile. */
  ideal: PersonaChip[]
  /** What the pool actually holds on this dimension (the market map). */
  pool: PersonaChip[]
}

export interface Persona {
  tabs: PersonaTab[]
  poolTotal: number | null
  /** True when pool facets were available (the org has pool access). */
  hasPool: boolean
}

/** The slice of getPoolFacets this builder needs. */
export interface PersonaFacets {
  companies: { name: string; count: number }[]
  titles: { name: string; count: number }[]
  skills: string[]
  cities: string[]
  total: number
}

const TAB_META: { key: PersonaTabKey; label: string; kinds: CriterionKind[] }[] = [
  { key: 'employers', label: 'Current employers', kinds: ['employer_current', 'employer_any', 'employer_past'] },
  { key: 'titles', label: 'Job titles', kinds: ['title_current', 'title_any'] },
  { key: 'skills', label: 'Skills', kinds: ['skill'] },
  { key: 'seniority', label: 'Seniority', kinds: ['seniority'] },
  { key: 'years', label: 'Years of experience', kinds: ['years_band'] },
  { key: 'locations', label: 'Locations', kinds: ['location'] },
]

function yearsBandLabel(c: SearchCriterion): string {
  if (c.min != null && c.max != null) return `${c.min}–${c.max} years`
  if (c.min != null) return `${c.min}+ years`
  if (c.max != null) return `≤ ${c.max} years`
  return 'Any experience'
}

/** One criterion → its display chips. */
function criterionChips(c: SearchCriterion): PersonaChip[] {
  if (c.kind === 'years_band') return [{ label: yearsBandLabel(c) }]
  if (c.kind === 'location') {
    const where = c.values[0]?.trim()
    if (!where) return []
    return [{ label: c.radius_km ? `${where} · ${c.radius_km} km` : where }]
  }
  return c.values
    .map((v) => ({ label: v.trim(), exclude: c.exclude || undefined }))
    .filter((x) => x.label)
}

/** Targeted values for one tab, de-duped, with "relaxed" set when only a wider level asks for it. */
function collectIdeal(spec: SearchSpec, kinds: CriterionKind[]): PersonaChip[] {
  const seen = new Map<string, PersonaChip>()
  const consider = (c: SearchCriterion, relaxed: boolean) => {
    if (!kinds.includes(c.kind)) return
    for (const chip of criterionChips(c)) {
      const key = `${chip.exclude ? '!' : ''}${chip.label.toLowerCase()}`
      const prev = seen.get(key)
      if (!prev) seen.set(key, { ...chip, relaxed })
      else if (!relaxed) prev.relaxed = false // seen at an ideal level → not a relaxation
    }
  }
  for (const c of spec.base) consider(c, false)
  spec.levels.forEach((lvl, i) => lvl.criteria.forEach((c) => consider(c, i > 0)))
  // Core (non-relaxed) first, widenings after; stable within each group.
  return Array.from(seen.values()).sort((a, b) => (a.relaxed ? 1 : 0) - (b.relaxed ? 1 : 0))
}

function countFor(name: string, facets: { name: string; count: number }[]): number | null {
  const key = name.toLowerCase()
  const hit = facets.find((f) => f.name.toLowerCase() === key)
  return hit ? hit.count : null
}

function summarize(key: PersonaTabKey, ideal: PersonaChip[]): string {
  const core = ideal.filter((c) => !c.relaxed)
  if (key === 'years' || key === 'locations') return core[0]?.label ?? ideal[0]?.label ?? '—'
  if (key === 'seniority') return core.map((c) => c.label).join(', ') || '—'
  const n = core.length || ideal.length
  if (!n) return '—'
  const noun = key === 'employers' ? (n === 1 ? 'company' : 'companies') : key === 'titles' ? (n === 1 ? 'title' : 'titles') : n === 1 ? 'skill' : 'skills'
  return `${n} ${noun}`
}

/** Build the six persona tabs from the ideal profile and (optionally) the pool facets. */
export function buildPersonaTabs(spec: SearchSpec | null, facets: PersonaFacets | null): Persona {
  const tabs: PersonaTab[] = TAB_META.map((meta) => {
    const ideal = spec ? collectIdeal(spec, meta.kinds) : []
    let pool: PersonaChip[] = []
    if (facets) {
      if (meta.key === 'employers') {
        for (const chip of ideal) chip.count = countFor(chip.label, facets.companies)
        pool = facets.companies.slice(0, 12).map((c) => ({ label: c.name, count: c.count }))
      } else if (meta.key === 'titles') {
        for (const chip of ideal) chip.count = countFor(chip.label, facets.titles)
        pool = facets.titles.slice(0, 12).map((c) => ({ label: c.name, count: c.count }))
      } else if (meta.key === 'skills') {
        pool = facets.skills.slice(0, 20).map((s) => ({ label: s }))
      } else if (meta.key === 'locations') {
        pool = facets.cities.slice(0, 20).map((s) => ({ label: s }))
      }
    }
    return { key: meta.key, label: meta.label, summary: summarize(meta.key, ideal), ideal, pool }
  })
  return { tabs, poolTotal: facets?.total ?? null, hasPool: !!facets }
}
