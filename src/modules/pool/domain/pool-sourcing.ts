import type { SupabaseClient } from '@supabase/supabase-js'
import type { Candidate, Database } from '@/lib/types/database'
import type { Icp } from '@/lib/types/icp'
import { icpEmbeddingText, candidateEmbeddingText } from '@/lib/ai/embeddings'
import { embedText, embedTexts } from '@/lib/ai/llm'
import { scoreAgainstIcp } from '@/lib/ai/fit-engine'
import { getPoolAccess } from '@/modules/pool/domain/pool'
import type { UsageIdentity } from '@/lib/ai/track-usage'
import { logger } from '@/lib/logger'

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
}

/** Build the Candidate shape the Fit Engine reads from a pool profile row. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function poolProfileToFitCandidate(p: any): Candidate {
  return {
    name: p.display_name ?? 'Candidate',
    current_title: p.current_title ?? null,
    location: p.location_city ?? p.location_raw ?? null,
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
  opts: { includeIds?: string[]; acquired?: Record<string, { level: number; label: string }> } = {},
): Promise<{ status: 'ok' | 'no_access' | 'empty'; matches: PoolMatch[] }> {
  const access = await getPoolAccess(supabase, orgId)
  if (!access.hasAccess) return { status: 'no_access', matches: [] }
  const sb = supabase as unknown as LooseSb

  const { data: unlocked } = await sb.from('pool_unlocks').select('profile_id').eq('org_id', orgId)
  const excludeIds = (unlocked ?? []).map((r: { profile_id: string }) => r.profile_id)

  let ids: string[] = []
  try {
    const query = await embedText(icpEmbeddingText(icp))
    const { data, error } = await sb.rpc('match_pool_profiles', {
      query_embedding: query,
      match_count: SHORTLIST,
      exclude_ids: excludeIds,
      only_reachable: false,
    })
    if (error) throw error
    ids = (data ?? []).map((r: { id: string }) => r.id)
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
    .select('id, display_name, current_title, current_company, location_city, location_raw, skills, experience_years, total_experience_months, current_tenure_months, reachable')
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
          )
          return {
            profile_id: p.id,
            name: p.display_name,
            current_title: p.current_title,
            current_company: p.current_company,
            location: p.location_city ?? p.location_raw ?? null,
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
          } as PoolMatch
        } catch {
          return null
        }
      }),
    )
    for (const m of scored) if (m) matches.push(m)
  }
  // Gates passed first; then the ladder level that reached them (a full match outranks a
  // relaxed one); then the judge's score. Pool recall with no level sorts after all levels.
  const lvl = (m: PoolMatch) => m.acquired?.level ?? 99
  matches.sort((a, b) => (Number(b.gate_failures.length === 0) - Number(a.gate_failures.length === 0)) || (lvl(a) - lvl(b)) || (b.score - a.score))
  return { status: 'ok', matches }
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
  await (supabase as unknown as LooseSb)
    .from('pool_sourcing_matches')
    .upsert(
      { org_id: orgId, job_id: jobId, icp_version: icpVersion, matches, updated_at: new Date().toISOString() },
      { onConflict: 'org_id,job_id' },
    )
}

/** The cached market shortlist for a job (for on-mount load). Null if none / table
 *  not there yet. Flags stale when the ICP has moved past the cached version. */
export async function getCachedPoolMatches(
  supabase: Supabase,
  orgId: string,
  jobId: string,
  currentIcpVersion: number | null,
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
      matches: (data.matches ?? []) as PoolMatch[],
      stale: currentIcpVersion != null && data.icp_version != null && data.icp_version !== currentIcpVersion,
      updated_at: data.updated_at,
    }
  } catch {
    return null
  }
}
