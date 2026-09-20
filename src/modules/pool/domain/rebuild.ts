/**
 * Materialize a pool profile from its claims (S1, stage 6).
 * See docs/pool-vendor-ingestion-architecture.md §2 stage 6.
 *
 * `pool_profiles` is a CACHE. The truth is `pool_profile_fields` (the claims) plus
 * `pool_experiences`. This module is the pure, re-runnable projection between them,
 * and that single property is what the whole multi-vendor design rests on:
 *
 *   change the fusion policy  → re-run. no re-buy.
 *   a vendor goes bad         → pool_sources.enabled = false, re-run. claims vanish.
 *   erasure request           → delete claims + documents, re-run.
 *   "why does it say Cisco?"  → read pool_profile_fields.
 *
 * So: never write a field here that isn't derived from claims. Anything hand-set on
 * pool_profiles will be silently destroyed by the next rebuild, which is correct.
 *
 * ONE QUALIFICATION, for legacy rows only: a field that NO source has ever claimed is
 * left untouched rather than nulled — see the `everClaimed` guard below. A disabled
 * source's claims still null their field; that is the kill switch and it must work.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'
import { deriveMovability, type EnrichedExperience } from '@/lib/ai/candidate-enrichment'
import { normalizeCompany, resolveLocationParts } from '@/modules/pool/domain/normalize'
import { fuseClaims, monthsBetween, type StoredClaim } from '@/modules/pool/domain/fusion'
import { logger } from '@/lib/logger'

type Supabase = SupabaseClient<Database>
// pool_* tables (migrations 115/122) aren't in the generated Supabase types.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LooseSb = any

/** Source trust, loaded once and reused across a batch rebuild. */
export interface TrustConfig {
  /** source_key → trust_weight, for ENABLED sources only. */
  sourceTrust: Record<string, number>
  /** "source_key:field" → weight. */
  fieldTrust: Record<string, number>
}

/**
 * Load the trust config. Disabled sources are simply absent from `sourceTrust`,
 * which is the kill switch: their claims are filtered out before fusion, so
 * flipping `enabled` and re-running erases a vendor's influence without touching a
 * single stored row.
 */
export async function loadTrustConfig(supabase: Supabase): Promise<TrustConfig> {
  const sb = supabase as unknown as LooseSb
  const [{ data: sources }, { data: fields }] = await Promise.all([
    sb.from('pool_sources').select('key,trust_weight,enabled'),
    sb.from('pool_source_field_trust').select('source_key,field,weight'),
  ])
  const sourceTrust: Record<string, number> = {}
  for (const s of (sources ?? []) as { key: string; trust_weight: number; enabled: boolean }[]) {
    if (s.enabled) sourceTrust[s.key] = s.trust_weight
  }
  const fieldTrust: Record<string, number> = {}
  for (const f of (fields ?? []) as { source_key: string; field: string; weight: number }[]) {
    fieldTrust[`${f.source_key}:${f.field}`] = f.weight
  }
  return { sourceTrust, fieldTrust }
}

export interface RebuildResult {
  profileId: string
  /** Fields whose fused value changed. Empty means the rebuild was a no-op. */
  changed: string[]
  /** True when a field the embedding is built from moved, so a re-embed is worth it. */
  needsReembed: boolean
  disputed: boolean
  evidenceAsOf: string | null
  sources: string[]
}

/** Fields the pool embedding is derived from — the only ones worth paying to re-embed for. */
const EMBEDDING_FIELDS = new Set(['current_title', 'current_company', 'skills', 'headline', 'location'])

function asString(v: unknown): string | null {
  if (typeof v === 'string') return v.trim() || null
  if (typeof v === 'number') return String(v)
  return null
}

function asNumber(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string') {
    const n = Number.parseFloat(v)
    return Number.isFinite(n) ? n : null
  }
  return null
}

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return []
  return v.filter((x): x is string => typeof x === 'string' && x.trim() !== '').map((x) => x.trim())
}

/** The date portion of an ISO timestamp. */
function isoDate(v: string | null): string | null {
  return v ? v.slice(0, 10) : null
}

/**
 * Rebuild one profile from its claims. Idempotent: running it twice with no new
 * claims produces an identical row and reports `changed: []`.
 *
 * `now` is injected so the derived tenure figures are testable and a batch rebuild
 * is internally consistent.
 */
export async function rebuildProfile(
  supabase: Supabase,
  profileId: string,
  trust: TrustConfig,
  now: Date = new Date(),
): Promise<RebuildResult> {
  const sb = supabase as unknown as LooseSb

  const [{ data: rawClaims }, { data: exps }, { data: contacts }, { data: docs }, { data: before }] =
    await Promise.all([
      sb.from('pool_profile_fields').select('field,value,source_key,confidence,observed_at').eq('profile_id', profileId),
      sb.from('pool_experiences')
        .select('title,employer,location,start_date,end_date,is_current,source_key,sort_order')
        .eq('profile_id', profileId).order('sort_order', { ascending: true }),
      sb.from('pool_contacts').select('kind').eq('profile_id', profileId),
      sb.from('pool_documents').select('vendor_updated_at,source_key').eq('profile_id', profileId),
      sb.from('pool_profiles')
        .select('current_title,current_company,location_city,location_region,location_country,headline,skills,display_name,experience_years,evidence_as_of,evidence_source,tenure_verified_months')
        .eq('id', profileId).maybeSingle(),
    ])

  // Claims from disabled sources never reach fusion — the kill switch.
  const claims = ((rawClaims ?? []) as StoredClaim[]).filter((c) => c.source_key in trust.sourceTrust)
  const fused = fuseClaims(claims, trust.sourceTrust, trust.fieldTrust, now)

  // Fields any source has EVER claimed — computed before the enabled-source filter,
  // and deliberately so. It separates two cases a naive projection conflates:
  //
  //   • claims exist but all their sources are disabled → null the field. That IS
  //     the kill switch working.
  //   • no source ever claimed the field → we have no opinion, so leave whatever is
  //     already on the row alone.
  //
  // The second case is not hypothetical: the original pool import wrote
  // display_name (145/145) and headline (97/145) straight onto pool_profiles
  // without recording claims, so a strict projection would erase both with no way
  // to recompute them. Absence of evidence is not evidence of absence.
  //
  // This is a legacy-data guard, not a permanent exception. The S1 adapters claim
  // display_name and headline like any other field, so it stops firing for anything
  // ingested through the pipeline; it only ever protects the pre-claims import.
  const everClaimed = new Set(((rawClaims ?? []) as StoredClaim[]).map((c) => c.field))

  const displayName = asString(fused.display_name?.value)
  const headline = asString(fused.headline?.value)
  const locationRaw = asString(fused.location?.value)
  const currentTitle = asString(fused.current_title?.value)
  const currentCompany = asString(fused.current_company?.value)
  const skills = asStringArray(fused.skills?.value)
  const education = Array.isArray(fused.education?.value) ? fused.education.value : []

  // ── Dated history → movability. Only experiences from enabled sources count. ──
  const liveExps = ((exps ?? []) as (EnrichedExperience & { source_key: string })[]).filter(
    (e) => e.source_key in trust.sourceTrust,
  )
  const movability = deriveMovability(liveExps, now)

  // ── evidence_as_of: the newest date any source ASSERTS about this person. ──
  // Not when we fetched it — when the source observed it. A vendor's own
  // "last refreshed" date (landed on the document) counts, as does every claim.
  // Without this, tenure runs role_start → now and overstates for stale records,
  // which is exactly the bug migration 117 exists to fix.
  // PREFER pool_documents.vendor_updated_at — the source's own "as of" stamp, which
  // is the only field defined to mean "when the source observed this".
  //
  // Claim observed_at is the fallback, NOT the primary, and that ordering is a scar:
  // the original pool import stamped every claim with the *import* time
  // (all 183 github + 446 web:resume claims say 2026-08-16), so deriving evidence
  // from claims made 145 stale profiles read as fresh and collapsed
  // tenure_verified_months onto current_tenure_months — re-creating the exact bug
  // migration 117 exists to fix. A source that cannot date itself gets NULL, which
  // surfaces as freshness 'unknown'. Unknown is honest; a fake recent date is not.
  const docDates = ((docs ?? []) as { vendor_updated_at: string | null }[])
    .map((d) => d.vendor_updated_at)
    .filter((d): d is string => Boolean(d))
  let evidenceAsOf: string | null = docDates.length ? docDates.slice().sort().at(-1)! : null
  if (!evidenceAsOf) {
    // No document stamp. Only trust claim dates when they actually vary — a single
    // timestamp shared by every claim is an import signature, not evidence.
    const claimDates = Array.from(new Set(claims.map((c) => isoDate(c.observed_at)).filter((d): d is string => Boolean(d))))
    evidenceAsOf = claimDates.length > 1 ? claimDates.sort().at(-1)! : null
  }

  // Which source produced that newest evidence — shown in the UI as the "as of".
  let evidenceSource: string | null = null
  if (evidenceAsOf) {
    const docMatch = ((docs ?? []) as { vendor_updated_at: string | null; source_key?: string }[]).find(
      (d) => d.vendor_updated_at === evidenceAsOf,
    )
    if (docMatch?.source_key) evidenceSource = docMatch.source_key
    else {
      const match = claims.filter((c) => isoDate(c.observed_at) === evidenceAsOf)
      evidenceSource = match.length
        ? match.reduce((best, c) =>
            (trust.sourceTrust[c.source_key] ?? 0) > (trust.sourceTrust[best.source_key] ?? 0) ? c : best,
          ).source_key
        : null
    }
  }

  // VERIFIED tenure: role start → evidence date. Never exceeds what a source
  // actually attests, unlike current_tenure_months which runs to now().
  const currentRole = liveExps.find((e) => e.is_current && e.start_date) ?? liveExps.find((e) => e.start_date)
  const tenureVerified =
    currentRole?.start_date && evidenceAsOf
      ? Math.max(0, monthsBetween(currentRole.start_date, new Date(evidenceAsOf)))
      : null

  const kinds = new Set(((contacts ?? []) as { kind: string }[]).map((c) => c.kind))
  const hasEmail = kinds.has('email')
  const hasLinkedin = kinds.has('linkedin')

  const sources = Array.from(new Set(claims.map((c) => c.source_key))).sort()
  const disputed = Boolean(fused.current_company?.disputed)

  const locationParts = resolveLocationParts(locationRaw)
  const row: Record<string, unknown> = {
    display_name: displayName,
    headline,
    location_raw: locationRaw,
    // City / region / country kept apart (the Ashby shape) so each can be filtered on its own.
    location_city: locationParts?.city ?? null,
    location_region: locationParts?.region ?? null,
    location_country: locationParts?.country ?? null,
    location_country_code: locationParts?.country_code ?? null,
    current_title: currentTitle,
    current_company: currentCompany,
    current_company_norm: normalizeCompany(currentCompany),
    experience_years:
      asNumber(fused.experience_years?.value) ??
      (movability.total_experience_months != null
        ? Math.round((movability.total_experience_months / 12) * 10) / 10
        : null),
    skills,
    education,
    num_roles: movability.num_roles,
    total_experience_months: movability.total_experience_months,
    current_tenure_months: movability.current_tenure_months,
    avg_tenure_months: movability.avg_tenure_months,
    last_move_months_ago: movability.last_move_months_ago,
    has_email: hasEmail,
    has_linkedin: hasLinkedin,
    reachable: hasEmail || hasLinkedin,
    sources,
    evidence_as_of: evidenceAsOf,
    evidence_source: evidenceSource,
    tenure_verified_months: tenureVerified,
    employer_disputed: disputed,
    updated_at: new Date().toISOString(),
  }

  // Apply the guard: drop any column whose fused value came out empty purely
  // because nothing was ever claimed for it, so the UPDATE leaves it untouched.
  const CLAIM_COLUMNS: Record<string, string[]> = {
    display_name: ['display_name'],
    headline: ['headline'],
    location: ['location_raw', 'location_city', 'location_region', 'location_country', 'location_country_code'],
    current_title: ['current_title'],
    current_company: ['current_company', 'current_company_norm'],
    experience_years: ['experience_years'],
    skills: ['skills'],
    education: ['education'],
  }
  for (const [field, columns] of Object.entries(CLAIM_COLUMNS)) {
    if (everClaimed.has(field)) continue
    for (const col of columns) {
      const v = row[col]
      if (v == null || (Array.isArray(v) && v.length === 0)) delete row[col]
    }
  }

  // What actually moved, so a caller can decide whether to pay for a re-embed.
  const prev = (before ?? {}) as Record<string, unknown>
  const changed: string[] = []
  // evidence_as_of and tenure_verified_months belong in this list. Leaving them out
  // is how a rebuild rewrote the freshness of all 145 profiles while the S1 gate
  // still reported "changed: 0". A change you don't measure is a change you ship.
  for (const key of ['display_name', 'headline', 'current_title', 'current_company', 'location_city', 'location_region',
                     'location_country', 'experience_years', 'evidence_as_of', 'evidence_source', 'tenure_verified_months']) {
    // A column the guard removed is not being written at all, so it cannot change.
    if (!(key in row)) continue
    if ((prev[key] ?? null) !== (row[key] ?? null)) changed.push(key)
  }
  if ('skills' in row) {
    const prevSkills = asStringArray(prev.skills).join('|').toLowerCase()
    if (prevSkills !== skills.join('|').toLowerCase()) changed.push('skills')
  }

  const { error } = await sb.from('pool_profiles').update(row).eq('id', profileId)
  if (error) {
    logger.error('rebuildProfile failed', error, { profileId })
    throw error
  }

  return {
    profileId,
    changed,
    needsReembed: changed.some((f) => EMBEDDING_FIELDS.has(f)),
    disputed,
    evidenceAsOf,
    sources,
  }
}

/**
 * Re-materialize every profile. Safe to run at any time — this is the "change the
 * policy, don't re-buy the data" lever, and the S1 gate runs it over the existing
 * 145 profiles to prove it's idempotent.
 */
export async function rebuildAllProfiles(
  supabase: Supabase,
  opts: { batchSize?: number; now?: Date; onProgress?: (done: number, total: number) => void } = {},
): Promise<{ total: number; changed: number; disputed: number; needsReembed: string[] }> {
  const sb = supabase as unknown as LooseSb
  const batchSize = opts.batchSize ?? 100
  const now = opts.now ?? new Date()
  const trust = await loadTrustConfig(supabase)

  const { data: ids, count } = await sb.from('pool_profiles').select('id', { count: 'exact' })
  const allIds = ((ids ?? []) as { id: string }[]).map((r) => r.id)

  let changed = 0
  let disputed = 0
  const needsReembed: string[] = []
  for (let i = 0; i < allIds.length; i += batchSize) {
    const batch = allIds.slice(i, i + batchSize)
    const results = await Promise.all(
      batch.map((id) =>
        rebuildProfile(supabase, id, trust, now).catch((err) => {
          logger.warn('rebuild skipped', { id, error: err instanceof Error ? err.message : String(err) })
          return null
        }),
      ),
    )
    for (const r of results) {
      if (!r) continue
      if (r.changed.length) changed++
      if (r.disputed) disputed++
      if (r.needsReembed) needsReembed.push(r.profileId)
    }
    opts.onProgress?.(Math.min(i + batchSize, allIds.length), allIds.length)
  }
  return { total: count ?? allIds.length, changed, disputed, needsReembed }
}
