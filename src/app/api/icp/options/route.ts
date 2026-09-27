import { NextResponse } from 'next/server'
import { withCapability } from '@/lib/api/helpers'
import { SKILL_CATALOG } from '@/lib/skills/catalog'
import { formatLocation } from '@/lib/ui/location'

/**
 * GET /api/icp/options — the suggestion lists behind the ideal-profile pickers.
 *
 * WHY SUGGESTIONS AND NOT A CLOSED LIST. A recruiter writing an ICP will sometimes name
 * a company or a title we have never seen, and refusing it would make the editor worse
 * than the free-text box it replaces. So every field here is a typeahead over real
 * values that still accepts anything typed. The list is there to stop the same idea
 * being spelled five ways ("Sr. Engineer", "Senior Engineer", "Sr Software Engineer"),
 * which is what makes a filter silently miss people.
 *
 * WHERE EACH LIST COMES FROM
 * - Cities   — the pool, formatted "City, Region, Country" so a picked value is
 *              unambiguous, ordered by how many people are actually there.
 * - Titles   — current titles AND past ones, because an ICP names roles people HELD,
 *              not only their present one.
 * - Companies— `company_facts`, which is the same 837 employers that carry a logo, so
 *              a picked company shows its mark in the pill.
 * - Skills   — the written catalog's canonical labels, not what the pool happens to
 *              contain: this is the one vocabulary that is meant to be complete, and
 *              picking from it means the ICP and the Skill Map agree.
 *
 * Memoised for an hour. These lists move when the pool is re-imported, not per request,
 * and every keystroke in a picker would otherwise be a query.
 */

const TTL_MS = 60 * 60 * 1000
/**
 * Keyed by org. The pool and company lists are cross-tenant by design, but
 * `departments` is this org's own — one shared cache entry would hand one customer's
 * department names to the next customer who opened an ICP.
 */
const memo = new Map<string, { at: number; body: unknown }>()

/** Most common first, then alphabetical, capped — a picker is scanned, not read. */
function ranked(values: (string | null | undefined)[], cap: number): string[] {
  const counts = new Map<string, { display: string; n: number }>()
  for (const v of values) {
    const t = (v ?? '').trim()
    if (t.length < 2) continue
    const key = t.toLowerCase()
    const seen = counts.get(key)
    if (seen) seen.n += 1
    else counts.set(key, { display: t, n: 1 })
  }
  return Array.from(counts.values())
    .sort((a, b) => b.n - a.n || a.display.localeCompare(b.display))
    .slice(0, cap)
    .map((c) => c.display)
}

export const GET = withCapability('recruiting:view', async (_req, orgId, supabase) => {
  const cached = memo.get(orgId)
  if (cached && Date.now() - cached.at < TTL_MS) return NextResponse.json(cached.body)

  const sb = supabase as unknown as {
    from: (t: string) => { select: (c: string, o?: unknown) => Promise<{ data: unknown[] | null }> & { limit: (n: number) => Promise<{ data: unknown[] | null }> } }
  }

  const [profiles, roles, companies, departments] = await Promise.all([
    sb.from('pool_profiles').select('current_title,location_city,location_region,location_country').limit(2000),
    sb.from('pool_experiences').select('title,employer').limit(5000),
    sb.from('company_facts').select('display_name,name_norm,employees').limit(2000),
    sb.from('departments').select('name').limit(200),
  ])

  const p = (profiles.data ?? []) as { current_title: string | null; location_city: string | null; location_region: string | null; location_country: string | null }[]
  const r = (roles.data ?? []) as { title: string | null; employer: string | null }[]
  const c = (companies.data ?? []) as { display_name: string | null; name_norm: string; employees: number | null }[]
  const d = (departments.data ?? []) as { name: string | null }[]

  const body = {
    // A city is only useful if it is unambiguous, so it carries its state and country.
    cities: ranked(p.map(formatLocation), 120),
    titles: ranked([...p.map((x) => x.current_title), ...r.map((x) => x.title)], 250),
    // Biggest first: a recruiter naming target companies reaches for the known ones.
    // Sorted as objects, then mapped — comparing by a lookup into the same array turns
    // an 837-row sort into ~700,000 scans.
    companies: c
      .map((x) => ({ name: (x.display_name ?? x.name_norm ?? '').trim(), n: x.employees ?? 0 }))
      .filter((x) => x.name.length > 1)
      .sort((a, b) => b.n - a.n || a.name.localeCompare(b.name))
      .slice(0, 400)
      .map((x) => x.name),
    // The canonical vocabulary, so an ICP's skills and a profile's Skill Map agree.
    skills: Object.values(SKILL_CATALOG).flat().map((e) => e.split('|')[0]).sort(),
    departments: ranked(d.map((x) => x.name), 60),
  }

  memo.set(orgId, { at: Date.now(), body })
  return NextResponse.json(body)
})
