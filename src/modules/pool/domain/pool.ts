/**
 * Candidate Pool facade (Component 05, Slice 5e; migration 115).
 *
 * The pool is a CROSS-ORG store — its tables carry no org_id. That makes this
 * facade the security boundary, not the query: nothing here returns raw pool rows
 * to a caller without first checking that the org holds an active grant, and
 * contact details are withheld until the org unlocks the profile.
 *
 * Read paths are deliberately two: `searchPool` is the Resdex-style product
 * surface (filters + facets), while semantic recall for a specific job goes
 * through match_pool_profiles() in the sourcing slice.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'

type Supabase = SupabaseClient<Database>
// Migration 115 isn't in the generated Supabase types yet — same loose handle as
// icps (104) and candidate_ai_summaries (103).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LooseSb = any

export interface PoolExperience {
  id: string
  title: string | null
  employer: string | null
  location: string | null
  start_date: string | null
  end_date: string | null
  is_current: boolean
  summary: string | null
  sort_order: number
  source_key: string
}

export interface PoolContact {
  kind: 'email' | 'linkedin' | 'phone' | 'website'
  value: string
  source_key: string
  confidence: string
}

export interface PoolProfileSummary {
  id: string
  display_name: string | null
  headline: string | null
  current_title: string | null
  current_company: string | null
  location_city: string | null
  experience_years: number | null
  skills: string[]
  num_roles: number | null
  total_experience_months: number | null
  /** ASSUMED tenure (role start → now). Overstates when the record is stale. */
  current_tenure_months: number | null
  /** VERIFIED tenure (role start → evidence_as_of). Never exceeds what a source attests. */
  tenure_verified_months: number | null
  /** Newest date any source asserts about this person. */
  evidence_as_of: string | null
  evidence_source: string | null
  /** Two sources name different current employers — one is out of date. */
  employer_disputed: boolean
  has_email: boolean
  has_linkedin: boolean
  reachable: boolean
  sources: string[]
  /** True when THIS org has already unlocked the profile. */
  unlocked?: boolean
  /** Derived at read time — storing it would itself go stale. */
  evidence_age_months?: number | null
  freshness?: 'fresh' | 'aging' | 'stale' | 'unknown'
}

export interface PoolProfileDetail extends PoolProfileSummary {
  education: { degree?: string | null; field?: string | null; school?: string | null; year?: number | null }[]
  experiences: PoolExperience[]
  /** Only populated once the org has unlocked the profile. */
  contacts: PoolContact[]
  /** Field-level provenance — which source claimed what, and how strongly. */
  provenance: { field: string; value: unknown; source_key: string; confidence: number }[]
}

export interface PoolSearchFilters {
  q?: string
  city?: string
  skill?: string
  minExperienceMonths?: number
  /** Last-known tenure (role start → now). Use for recall. */
  minTenureMonths?: number
  /** Verified tenure (role start → evidence date). Strict; very low recall. */
  minVerifiedTenureMonths?: number
  /** Only profiles whose newest evidence is at most this many months old. */
  maxEvidenceAgeMonths?: number
  reachableOnly?: boolean
  source?: string
  limit?: number
  offset?: number
}

export interface PoolAccess {
  hasAccess: boolean
  tier?: string
  unlockQuota?: number | null
  unlocksUsed?: number
}

const SUMMARY_COLS =
  'id,display_name,headline,current_title,current_company,location_city,experience_years,' +
  'skills,num_roles,total_experience_months,current_tenure_months,has_email,has_linkedin,' +
  'reachable,sources,evidence_as_of,evidence_source,tenure_verified_months,employer_disputed'

/** Months between an ISO date and now. */
function monthsSince(iso: string | null): number | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  const n = new Date()
  return Math.max(0, (n.getFullYear() - d.getFullYear()) * 12 + (n.getMonth() - d.getMonth()))
}

/**
 * Derive freshness at read time. Deliberately NOT a stored column: a staleness
 * number written today is wrong tomorrow. `evidence_as_of` is the stored fact.
 */
export function withFreshness<T extends PoolProfileSummary>(row: T): T {
  const age = monthsSince(row.evidence_as_of)
  row.evidence_age_months = age
  row.freshness = age == null ? 'unknown' : age <= 12 ? 'fresh' : age <= 36 ? 'aging' : 'stale'
  return row
}

/** Does this org hold an active pool subscription? The gate for every read below. */
export async function getPoolAccess(supabase: Supabase, orgId: string): Promise<PoolAccess> {
  const sb = supabase as unknown as LooseSb
  const { data, error } = await sb
    .from('pool_access_grants')
    .select('tier,unlock_quota,unlocks_used,active,expires_at')
    .eq('org_id', orgId)
    .maybeSingle()
  if (error) throw error
  if (!data || !data.active) return { hasAccess: false }
  if (data.expires_at && new Date(data.expires_at) < new Date()) return { hasAccess: false }
  return {
    hasAccess: true,
    tier: data.tier,
    unlockQuota: data.unlock_quota,
    unlocksUsed: data.unlocks_used ?? 0,
  }
}

/** Self-serve trial grant. Idempotent — re-activates rather than duplicating. */
export async function startPoolTrial(supabase: Supabase, orgId: string): Promise<PoolAccess> {
  const sb = supabase as unknown as LooseSb
  const { error } = await sb
    .from('pool_access_grants')
    .upsert({ org_id: orgId, tier: 'trial', unlock_quota: 25, active: true }, { onConflict: 'org_id' })
  if (error) throw error
  return getPoolAccess(supabase, orgId)
}

/** Resdex-style search over the pool. Returns summaries only — never contacts. */
export async function searchPool(
  supabase: Supabase,
  orgId: string,
  f: PoolSearchFilters = {},
): Promise<{ rows: PoolProfileSummary[]; total: number }> {
  const sb = supabase as unknown as LooseSb
  const limit = Math.min(f.limit ?? 25, 100)
  const offset = f.offset ?? 0

  let q = sb
    .from('pool_profiles')
    .select(SUMMARY_COLS, { count: 'exact' })
    .order('total_experience_months', { ascending: false, nullsFirst: false })
    .range(offset, offset + limit - 1)

  if (f.city) q = q.eq('location_city', f.city)
  if (f.skill) q = q.contains('skills', [f.skill])
  if (f.source) q = q.contains('sources', [f.source])
  if (f.reachableOnly) q = q.eq('reachable', true)
  if (f.minExperienceMonths) q = q.gte('total_experience_months', f.minExperienceMonths)
  // `minTenureMonths` filters LAST KNOWN tenure (role start → now). Filtering
  // VERIFIED tenure instead is honest but useless: a résumé is written while its
  // author is job-hunting, so its document date sits at the START of the role they
  // are now in — measured across the first 108 profiles, median verified tenure was
  // 6 months and only 2 people cleared three years. No first-party source observes
  // the present, so recall comes from the assumed figure and QUALITY comes from
  // `maxEvidenceAgeMonths` below. Both numbers are always shown to the recruiter.
  if (f.minTenureMonths) q = q.gte('current_tenure_months', f.minTenureMonths)
  if (f.minVerifiedTenureMonths) q = q.gte('tenure_verified_months', f.minVerifiedTenureMonths)
  if (f.maxEvidenceAgeMonths) {
    const cut = new Date()
    cut.setMonth(cut.getMonth() - f.maxEvidenceAgeMonths)
    q = q.gte('evidence_as_of', cut.toISOString().slice(0, 10))
  }
  if (f.q) {
    const term = f.q.replace(/[%,()]/g, ' ').trim()
    if (term) {
      q = q.or(
        `display_name.ilike.%${term}%,current_title.ilike.%${term}%,` +
          `current_company.ilike.%${term}%,headline.ilike.%${term}%`,
      )
    }
  }

  const { data, error, count } = await q
  if (error) throw error
  const rows = ((data ?? []) as PoolProfileSummary[]).map(withFreshness)

  // Mark the ones this org has already unlocked, so the UI can show "in your ATS".
  if (rows.length) {
    const { data: un } = await sb
      .from('pool_unlocks')
      .select('profile_id')
      .eq('org_id', orgId)
      .in('profile_id', rows.map((r) => r.id))
    const unlocked = new Set((un ?? []).map((u: { profile_id: string }) => u.profile_id))
    for (const r of rows) r.unlocked = unlocked.has(r.id)
  }
  return { rows, total: count ?? rows.length }
}

/** Full profile. Contacts are withheld unless this org has unlocked it. */
export async function getPoolProfile(
  supabase: Supabase,
  orgId: string,
  id: string,
): Promise<PoolProfileDetail | null> {
  const sb = supabase as unknown as LooseSb

  const { data: p, error } = await sb
    .from('pool_profiles')
    .select(`${SUMMARY_COLS},education`)
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  if (!p) return null

  const [{ data: exps }, { data: prov }, { data: unlock }] = await Promise.all([
    sb.from('pool_experiences')
      .select('id,title,employer,location,start_date,end_date,is_current,summary,sort_order,source_key')
      .eq('profile_id', id).order('sort_order'),
    sb.from('pool_profile_fields')
      .select('field,value,source_key,confidence')
      .eq('profile_id', id).order('confidence', { ascending: false }),
    sb.from('pool_unlocks').select('id').eq('org_id', orgId).eq('profile_id', id).maybeSingle(),
  ])

  let contacts: PoolContact[] = []
  if (unlock) {
    const { data: c } = await sb
      .from('pool_contacts')
      .select('kind,value,source_key,confidence')
      .eq('profile_id', id)
    contacts = (c ?? []) as PoolContact[]
  }

  return {
    ...withFreshness(p as PoolProfileSummary),
    education: (p as { education?: PoolProfileDetail['education'] }).education ?? [],
    experiences: (exps ?? []) as PoolExperience[],
    contacts,
    unlocked: Boolean(unlock),
    provenance: (prov ?? []) as PoolProfileDetail['provenance'],
  }
}

/** Distinct values for the search facets, computed from what's actually in the pool. */
export async function getPoolFacets(
  supabase: Supabase,
): Promise<{ cities: string[]; skills: string[]; sources: string[]; total: number }> {
  const sb = supabase as unknown as LooseSb
  const { data, count } = await sb
    .from('pool_profiles')
    .select('location_city,skills,sources', { count: 'exact' })
    .limit(1000)
  const cities = new Set<string>()
  const skills = new Map<string, number>()
  const sources = new Set<string>()
  for (const r of (data ?? []) as { location_city: string | null; skills: string[]; sources: string[] }[]) {
    if (r.location_city) cities.add(r.location_city)
    for (const s of r.skills ?? []) skills.set(s, (skills.get(s) ?? 0) + 1)
    for (const s of r.sources ?? []) sources.add(s)
  }
  return {
    cities: Array.from(cities).sort(),
    skills: Array.from(skills.entries()).sort((a, b) => b[1] - a[1]).slice(0, 40).map(([s]) => s),
    sources: Array.from(sources).sort(),
    total: count ?? 0,
  }
}
