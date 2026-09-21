import type { SupabaseClient } from '@supabase/supabase-js'
import type { Candidate, Database } from '@/lib/types/database'
import type { Icp } from '@/lib/types/icp'
import { icpEmbeddingText, candidateEmbeddingText } from '@/lib/ai/embeddings'
import { embedText, embedTexts } from '@/lib/ai/llm'
import { scoreAgainstIcp } from '@/lib/ai/fit-engine'
import { getPoolAccess } from '@/modules/pool/domain/pool'
import type { UsageIdentity } from '@/lib/ai/track-usage'
import { logger } from '@/lib/logger'
import { deriveProfileTags } from '@/modules/pool/domain/profile-tags'
import { formatLocation, formatLocationParts, resolveLocationParts, type LocationParts } from '@/modules/pool/domain/normalize'
import { unexpectedGateFailures } from '@/lib/icp-gates'

type Supabase = SupabaseClient<Database>
// pool_* tables (migration 115) aren't in the generated types.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LooseSb = any

const SHORTLIST = 20
const CONCURRENCY = 5

export interface PoolMatch {
  profile_id: string
  name: string | null
  current_title: string | null
  current_company: string | null
  location: string | null
  reachable: boolean
  experience_years: number | null
  total_experience_months: number | null
  current_tenure_months: number | null
  skills: string[]
  score: number
  fit_bucket: string
  rationale: string
  gate_failures: string[]
  // Optional: older cached matches (scored before this was added) won't carry them.
  competencies?: { name: string; rating: number; evidence?: string }[]
  red_flags?: string[]
  /** Gates the judge couldn't establish from the data on file ("unverified"). */
  gate_unknown?: string[]
  /** Where this profile came from (pool_identities.source_key), e.g. 'vendor:crustdata'. */
  sources?: string[]
  /** The ladder level that acquired this person (1 = the 100% match), when known. */
  acquired?: { level: number; label: string } | null
  /** Judge's one-line reason per gate label — shown when a cell is clicked. */
  gate_reasons?: Record<string, string>
  /** One-glance labels derived from role history ("Ex-McKinsey", "Fast career growth"). */
  tags?: string[]
  /** Highest degree + school, e.g. "MBA · IIM Ahmedabad". */
  education_summary?: string | null
  /** Recruiter flags — kept across re-ranks (savePoolMatches carries them forward). */
  starred?: boolean
  hidden?: boolean
  /** Set when a pool-recall profile falls outside the plan's Everyone line (location / years); acquired people are never marked. */
  outside_plan?: string | null
}

/** The plan's must-have line, as the ranking applies it to pool recall. */
export interface PlanEveryone {
  city: string | null
  /** The plan city's state/province and ISO country — what a city-less profile is held against. */
  region?: string | null
  country_code?: string | null
  locationText: string | null
  minYears: number | null
  maxYears: number | null
}

/** Why a profile is outside the plan's Everyone line, or null when it fits (or can't be judged). PURE. */
export function outsidePlanReason(
  m: { location: string | null; experience_years: number | null; acquired?: { level: number } | null },
  plan: PlanEveryone | null | undefined,
): string | null {
  if (!plan || m.acquired) return null
  // City when known → region when known → country when known. A level that is
  // genuinely unknown passes; "Texas, United States" with no city does not pass New York.
  const loc = resolveLocationParts(m.location)
  if (plan.city && loc?.city && loc.city !== plan.city) return `${loc.city}, not ${plan.city}`
  if (plan.city && !loc?.city && loc?.region && plan.region && loc.region !== plan.region) return `${loc.region}, not ${plan.city}`
  if (plan.city && !loc?.city && !loc?.region && loc?.country && plan.country_code && loc.country_code !== plan.country_code) return `${loc.country}, not ${plan.city}`
  const yrs = m.experience_years
  if (yrs != null) {
    if (plan.minYears != null && yrs < plan.minYears - 1) return `${yrs} yrs, under ${plan.minYears}`
    if (plan.maxYears != null && yrs > plan.maxYears + 1) return `${yrs} yrs, over ${plan.maxYears}`
  }
  return null
}

/** Latest degree year on file, if any. */
export function graduationYear(edu: { year?: string | number | null }[]): number | null {
  const years = edu.map((e) => Number(e.year)).filter((y) => Number.isFinite(y) && y > 1950 && y < 2100)
  return years.length ? Math.max(...years) : null
}

/** "MBA · IIM Ahmedabad" from the stored education claim (highest-looking degree first). */
export function educationSummary(edu: { degree?: string | null; school?: string | null }[]): string | null {
  if (!edu?.length) return null
  const rank = (d: string) => (/phd|doctor/i.test(d) ? 4 : /mba|pgp|pgdm|master|m\.?tech|m\.?sc|ms\b/i.test(d) ? 3 : /b\.?tech|b\.?e\b|bachelor|b\.?sc|b\.?a\b|b\.?com/i.test(d) ? 2 : 1)
  const best = [...edu].sort((a, b) => rank(b.degree ?? '') - rank(a.degree ?? ''))[0]
  const parts = [best.degree?.trim(), best.school?.trim()].filter(Boolean)
  return parts.length ? parts.join(' · ') : null
}

/** Build the Candidate shape the Fit Engine reads from a pool profile row. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function poolProfileToFitCandidate(p: any): Candidate {
  return {
    name: p.display_name ?? 'Candidate',
    current_title: p.current_title ?? null,
    location: formatLocationParts(p) ?? p.location_raw ?? null,
    skills: p.skills ?? [],
    experience_years: p.experience_years ?? null,
  } as unknown as Candidate
}

/**
 * Sourcing over the cross-org Candidate Pool (Pool B). Semantic recall against the
 * pool by the job's ICP, then Fit-Engine scored — the same brain as Pool A, over the
 * market. Excludes profiles this org has already unlocked. Degrades gracefully: no
 * pool subscription, no embeddings, or an empty pool all return no matches, never an error.
 */
export async function sourcePoolForIcp(
  supabase: Supabase,
  orgId: string,
  icp: Icp,
  identity: UsageIdentity = {},
  // Profile ids that must be scored regardless of semantic recall — e.g. everything a
  // Crustdata run just bought. A bought profile that never gets scored is money spent
  // on a person the recruiter never sees.
  opts: {
    includeIds?: string[]
    /** Per bought profile: the ladder level that reached them and the must-have ids that query applied. */
    acquired?: Record<string, { level: number; label: string; vendorGateIds?: string[] }>
    feederEmployers?: string[]
    plan?: PlanEveryone | null
    /** Ideal-profile ladder: gate label → level it relaxes at, so expected misses don't rank as failures. */
    relaxAtByLabel?: Record<string, number | null | undefined> | null
  } = {},
): Promise<{ status: 'ok' | 'no_access' | 'empty'; matches: PoolMatch[] }> {
  const access = await getPoolAccess(supabase, orgId)
  if (!access.hasAccess) return { status: 'no_access', matches: [] }
  const sb = supabase as unknown as LooseSb

  const { data: unlocked } = await sb.from('pool_unlocks').select('profile_id').eq('org_id', orgId)
  const excludeIds = (unlocked ?? []).map((r: { profile_id: string }) => r.profile_id)

  let ids: string[] = []
  try {
    const query = await embedText(icpEmbeddingText(icp))
    // Plan first: the N slots go to people inside the Everyone line (city / years band,
    // same tolerance as outsidePlanReason — unknowns pass). Only when fewer than N exist
    // are the remaining slots filled with the nearest people outside it, which the UI
    // then folds as "elsewhere in your pool" rather than never showing at all.
    const plan = opts.plan
    const recall = async (count: number, held: boolean, exclude: string[]) => {
      const { data, error } = await sb.rpc('match_pool_profiles', {
        query_embedding: query,
        match_count: count,
        exclude_ids: exclude,
        only_reachable: false,
        plan_city: held ? plan?.city ?? null : null,
        plan_min_years: held ? plan?.minYears ?? null : null,
        plan_max_years: held ? plan?.maxYears ?? null : null,
        plan_region: held ? plan?.region ?? null : null,
        plan_country_code: held ? plan?.country_code ?? null : null,
      })
      if (error) throw error
      return (data ?? []).map((r: { id: string }) => r.id) as string[]
    }
    const hasPlan = Boolean(plan && (plan.city || plan.minYears != null || plan.maxYears != null))
    ids = await recall(SHORTLIST, hasPlan, excludeIds)
    if (hasPlan && ids.length < SHORTLIST) {
      ids.push(...(await recall(SHORTLIST - ids.length, false, [...excludeIds, ...ids])))
    }
  } catch (err) {
    logger.warn('Pool semantic recall failed', { error: err instanceof Error ? err.message : String(err) })
    if (!opts.includeIds?.length) return { status: 'ok', matches: [] }
  }
  // Union in the must-score ids (bought this run), de-duplicated, excluding unlocked.
  const excluded = new Set(excludeIds)
  for (const id of opts.includeIds ?? []) if (id && !excluded.has(id) && !ids.includes(id)) ids.push(id)
  if (!ids.length) return { status: 'empty', matches: [] }

  const { data: profiles } = await sb
    .from('pool_profiles')
    .select('id, display_name, current_title, current_company, location_city, location_region, location_country, location_country_code, location_raw, skills, experience_years, total_experience_months, current_tenure_months, reachable')
    .in('id', ids)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const byId = new Map((profiles ?? []).map((p: any) => [p.id, p]))
  const ordered = ids.map((id) => byId.get(id)).filter(Boolean)

  // Dated work history per profile, so background deal-breakers are judged on real
  // roles held — not the current title alone (market profiles are often the thinnest).
  // Role descriptions (summary) ride along as free-text evidence: that is where a
  // vendor profile mentions SQL, team size, scale — the things the skills list lacks.
  const [{ data: pexps }, { data: pedu }, { data: pids }] = await Promise.all([
    sb
      .from('pool_experiences')
      .select('profile_id, title, employer, start_date, end_date, is_current, sort_order, summary')
      .in('profile_id', ids).order('sort_order', { ascending: true }),
    sb.from('pool_profile_fields').select('profile_id, value, confidence').eq('field', 'education').in('profile_id', ids),
    sb.from('pool_identities').select('profile_id, source_key').in('profile_id', ids),
  ])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const expsByProfile = new Map<string, any[]>()
  const textByProfile = new Map<string, string[]>()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const e of (pexps ?? []) as any[]) {
    const arr = expsByProfile.get(e.profile_id) ?? []
    arr.push({ title: e.title, employer: e.employer, start_date: e.start_date, end_date: e.end_date, is_current: e.is_current })
    expsByProfile.set(e.profile_id, arr)
    if (typeof e.summary === 'string' && e.summary.trim()) {
      const t = textByProfile.get(e.profile_id) ?? []
      t.push(`${[e.title, e.employer].filter(Boolean).join(' at ')}: ${e.summary.trim()}`)
      textByProfile.set(e.profile_id, t)
    }
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const eduByProfile = new Map<string, any[]>()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const r of (pedu ?? []) as any[]) {
    if (eduByProfile.has(r.profile_id) || !Array.isArray(r.value)) continue
    eduByProfile.set(r.profile_id, r.value)
  }
  const sourcesByProfile = new Map<string, string[]>()
  for (const r of (pids ?? []) as { profile_id: string; source_key: string }[]) {
    const arr = sourcesByProfile.get(r.profile_id) ?? []
    if (!arr.includes(r.source_key)) arr.push(r.source_key)
    sourcesByProfile.set(r.profile_id, arr)
  }

  const matches: PoolMatch[] = []
  for (let i = 0; i < ordered.length; i += CONCURRENCY) {
    const chunk = ordered.slice(i, i + CONCURRENCY)
    const scored = await Promise.all(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      chunk.map(async (p: any) => {
        try {
          // Market candidates: assume complete vendor data → REJECT when it's missing.
          const profileText = (textByProfile.get(p.id) ?? []).join('\n').slice(0, 4000) || undefined
          const fit = await scoreAgainstIcp(
            poolProfileToFitCandidate(p), icp, identity, profileText,
            { experiences: expsByProfile.get(p.id) ?? [], education: eduByProfile.get(p.id) ?? [] },
            'reject',
            opts.acquired?.[p.id]?.vendorGateIds?.length ? { vendorFilteredGateIds: new Set(opts.acquired[p.id].vendorGateIds) } : {},
          )
          return {
            profile_id: p.id,
            name: p.display_name,
            current_title: p.current_title,
            current_company: p.current_company,
            location: formatLocationParts(p) ?? formatLocation(p.location_raw) ?? null,
            reachable: !!p.reachable,
            experience_years: p.experience_years ?? null,
            total_experience_months: p.total_experience_months ?? null,
            current_tenure_months: p.current_tenure_months ?? null,
            skills: p.skills ?? [],
            score: fit.score,
            fit_bucket: fit.fit_bucket,
            rationale: fit.rationale,
            gate_failures: fit.gate_failures.map((g) => g.label),
            gate_unknown: fit.gate_unknown.map((g) => g.label),
            competencies: fit.competencies.map((c) => ({ name: c.name, rating: c.rating, evidence: c.evidence })),
            red_flags: fit.red_flags,
            sources: sourcesByProfile.get(p.id) ?? [],
            acquired: opts.acquired?.[p.id] ? { level: opts.acquired[p.id].level, label: opts.acquired[p.id].label } : null,
            gate_reasons: Object.fromEntries(fit.gate_results.map((g) => [g.label, g.reason])),
            tags: deriveProfileTags(expsByProfile.get(p.id) ?? [], { feederEmployers: opts.feederEmployers, graduationYear: graduationYear(eduByProfile.get(p.id) ?? []) }),
            education_summary: educationSummary(eduByProfile.get(p.id) ?? []),
          } as PoolMatch
        } catch {
          return null
        }
      }),
    )
    for (const m of scored) if (m) matches.push(m)
  }
  return { status: 'ok', matches: rankPoolMatches(matches, opts.plan, opts.relaxAtByLabel) }
}

/**
 * Write embeddings for the given pool profiles so semantic recall (match_pool_profiles)
 * can find them. Nothing else in the pipeline writes pool_profiles.embedding, so newly
 * ingested profiles are invisible to sourcing until this runs — call it with the
 * `needsReembed` set an ingest returns. Best-effort and batched: a failed embed leaves
 * that row's embedding as-is rather than throwing. Returns how many were written.
 */
export async function embedPoolProfiles(supabase: Supabase, profileIds: string[]): Promise<number> {
  const ids = Array.from(new Set(profileIds.filter(Boolean)))
  if (!ids.length) return 0
  const sb = supabase as unknown as LooseSb

  let embedded = 0
  for (let i = 0; i < ids.length; i += 100) {
    const batch = ids.slice(i, i + 100)
    const { data: rows } = await sb
      .from('pool_profiles')
      .select('id, current_title, current_company, skills')
      .in('id', batch)
    // A profile with no title, company or skills has nothing to embed — and Gemini
    // rejects the WHOLE batch on one empty part, so drop those before the call.
    const profiles = ((rows ?? []) as { id: string; current_title: string | null; current_company: string | null; skills: string[] | null }[])
      .filter((p) => candidateEmbeddingText(p).length > 0)
    if (!profiles.length) continue

    try {
      const vectors = await embedTexts(profiles.map((p) => candidateEmbeddingText(p)))
      for (let j = 0; j < profiles.length; j++) {
        const v = vectors[j]
        if (!v || v.length === 0) continue
        const { error } = await sb.from('pool_profiles').update({ embedding: v }).eq('id', profiles[j].id)
        if (!error) embedded++
      }
    } catch (err) {
      logger.warn('Pool profile embedding failed', { error: err instanceof Error ? err.message : String(err), count: profiles.length })
    }
  }
  return embedded
}

/** Persist the market shortlist so it survives a refresh (and avoids re-scoring). */
export async function savePoolMatches(
  supabase: Supabase,
  orgId: string,
  jobId: string,
  icpVersion: number | null,
  matches: PoolMatch[],
): Promise<void> {
  const sb = supabase as unknown as LooseSb
  // Recruiter flags (starred / hidden) live on the cached row; a re-rank must not lose them.
  const { data: prev } = await sb.from('pool_sourcing_matches').select('matches').eq('org_id', orgId).eq('job_id', jobId).maybeSingle()
  const flags = new Map<string, { starred?: boolean; hidden?: boolean }>()
  for (const m of ((prev?.matches ?? []) as PoolMatch[])) if (m.starred || m.hidden) flags.set(m.profile_id, { starred: m.starred, hidden: m.hidden })
  const merged = matches.map((m) => (flags.has(m.profile_id) ? { ...m, ...flags.get(m.profile_id) } : m))
  await sb
    .from('pool_sourcing_matches')
    .upsert(
      { org_id: orgId, job_id: jobId, icp_version: icpVersion, matches: merged, updated_at: new Date().toISOString() },
      { onConflict: 'org_id,job_id' },
    )
}

/** Set a recruiter flag on one cached market match (star / hide). Returns false when the profile isn't in the cache. */
export async function setPoolMatchFlags(
  supabase: Supabase,
  orgId: string,
  jobId: string,
  profileId: string,
  flags: { starred?: boolean; hidden?: boolean },
): Promise<boolean> {
  const sb = supabase as unknown as LooseSb
  const { data: row } = await sb.from('pool_sourcing_matches').select('matches').eq('org_id', orgId).eq('job_id', jobId).maybeSingle()
  const matches = ((row?.matches ?? []) as PoolMatch[])
  if (!matches.some((m) => m.profile_id === profileId)) return false
  const next = matches.map((m) => (m.profile_id === profileId ? { ...m, ...flags } : m))
  const { error } = await sb.from('pool_sourcing_matches').update({ matches: next, updated_at: new Date().toISOString() }).eq('org_id', orgId).eq('job_id', jobId)
  if (error) throw error
  return true
}

/**
 * Mark and order a scored shortlist. Applied when the shortlist is produced AND
 * every time a cached one is read, so a snapshot scored under older rules shows
 * the current ones without re-scoring.
 *
 * Marks: pool-recall profiles outside the plan's Everyone line (wrong city / outside
 * the years band) get `outside_plan` so the UI can fold them away; people the plan
 * acquired never are. Order: inside the plan before outside · all gates met → some
 * unknown → any failed · then the ladder level that reached them (full match beats
 * relaxed) · then score. PURE — returns a new array, the input is not mutated.
 */
export function rankPoolMatches(matches: PoolMatch[], plan: PlanEveryone | null | undefined, relaxAtByLabel?: Record<string, number | null | undefined> | null): PoolMatch[] {
  const marked = matches.map((m) => ({ ...m, outside_plan: outsidePlanReason(m, plan) }))
  // A miss on a dimension the person's level deliberately relaxed is expected, not a failure.
  const gateState = (m: PoolMatch) => (unexpectedGateFailures(m.gate_failures ?? [], m.acquired?.level ?? null, relaxAtByLabel).length ? 2 : (m.gate_unknown?.length ? 1 : 0))
  const lvl = (m: PoolMatch) => m.acquired?.level ?? 99
  return marked.sort((a, b) =>
    (Number(Boolean(a.outside_plan)) - Number(Boolean(b.outside_plan))) ||
    (gateState(a) - gateState(b)) ||
    (lvl(a) - lvl(b)) ||
    (b.score - a.score))
}

/**
 * Location is never trusted from the snapshot: it is re-read from pool_profiles
 * (the standardised city / region / country columns) so a fix to the normaliser or a
 * backfill shows up without re-running — and re-scoring — the shortlist. Everything
 * else in the snapshot stays as scored. Falls back to the cached text per row.
 */
export async function withLiveLocations(supabase: Supabase, matches: PoolMatch[]): Promise<PoolMatch[]> {
  const ids = matches.map((m) => m.profile_id).filter(Boolean)
  if (!ids.length) return matches
  const { data } = await (supabase as unknown as LooseSb)
    .from('pool_profiles')
    .select('id, location_city, location_region, location_country, location_country_code, location_raw')
    .in('id', ids)
  const byId = new Map<string, LocationParts & { location_raw: string | null }>()
  for (const p of (data ?? []) as { id: string; location_city: string | null; location_region: string | null; location_country: string | null; location_country_code: string | null; location_raw: string | null }[]) {
    byId.set(p.id, { city: p.location_city, region: p.location_region, country: p.location_country, country_code: p.location_country_code, location_raw: p.location_raw })
  }
  return matches.map((m) => {
    const p = byId.get(m.profile_id)
    if (!p) return m
    return { ...m, location: formatLocationParts(p) ?? formatLocation(p.location_raw) ?? m.location }
  })
}

/** The cached market shortlist for a job (for on-mount load). Null if none / table
 *  not there yet. Flags stale when the ICP has moved past the cached version.
 *  Locations, plan marks and order are recomputed on read (see withLiveLocations /
 *  rankPoolMatches); scores and gate results stay as cached. */
export async function getCachedPoolMatches(
  supabase: Supabase,
  orgId: string,
  jobId: string,
  currentIcpVersion: number | null,
  /** The job's current Everyone line; when given, the snapshot is re-marked and re-sorted under it. */
  plan?: PlanEveryone | null,
  relaxAtByLabel?: Record<string, number | null | undefined> | null,
): Promise<{ matches: PoolMatch[]; stale: boolean; updated_at: string } | null> {
  try {
    const { data, error } = await (supabase as unknown as LooseSb)
      .from('pool_sourcing_matches')
      .select('matches, icp_version, updated_at')
      .eq('org_id', orgId)
      .eq('job_id', jobId)
      .maybeSingle()
    if (error || !data) return null
    return {
      matches: rankPoolMatches(await withLiveLocations(supabase, (data.matches ?? []) as PoolMatch[]), plan, relaxAtByLabel),
      stale: currentIcpVersion != null && data.icp_version != null && data.icp_version !== currentIcpVersion,
      updated_at: data.updated_at,
    }
  } catch {
    return null
  }
}
