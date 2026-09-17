/**
 * Claim fusion (S1). See docs/pool-vendor-ingestion-architecture.md §2 stage 5.
 *
 * Turns N sources' claims about one person into one value per field. This is the
 * step that makes multi-vendor possible: adapters emit claims and stop, and nothing
 * here knows the name of any vendor — only a source key and a trust weight.
 *
 * Two things migration 115's single `trust_weight` could not express, and that this
 * module adds:
 *
 *   1. RECENCY BEATS TRUST on volatile fields. A mediocre source that saw someone
 *      last month is more right about their employer than an excellent source from
 *      2023. So a claim's weight decays with its age — but only for fields that
 *      actually change.
 *
 *   2. TRUST IS PER-FIELD. A profile vendor is excellent on employment history and
 *      mediocre on personal email; GitHub is authoritative on a GitHub login and
 *      worthless on tenure. `pool_source_field_trust` overrides the source default
 *      for one field.
 *
 * Everything here is PURE and unit-tested. The database reads and writes live in
 * rebuild.ts, so the policy can be argued with in a test rather than in production.
 */
import type { ClaimField } from '@/modules/pool/vendors/types'

/** A claim as stored in pool_profile_fields, ready to be scored. */
export interface StoredClaim {
  field: string
  value: unknown
  source_key: string
  /** ISO timestamp/date. The date the SOURCE observed it, not when we fetched it. */
  observed_at: string
  /** 0–100. */
  confidence: number
}

export type FieldPolicy =
  /** Volatile fact. Highest score wins, and score decays hard with age. */
  | 'recency_dominant'
  /** Stable fact. Highest score wins; age is ignored entirely. */
  | 'trust_dominant'
  /** Not a conflict — sources differ by coverage. Take the union. */
  | 'union'

/**
 * How each field resolves. A field with no entry defaults to 'trust_dominant',
 * which is the conservative choice: it never lets a fresh-but-weak source
 * overwrite a strong one just for being new.
 */
export const FIELD_POLICY: Partial<Record<ClaimField, FieldPolicy>> = {
  current_title: 'recency_dominant',
  current_company: 'recency_dominant',
  headline: 'recency_dominant',
  location: 'recency_dominant',
  experience_years: 'recency_dominant',
  display_name: 'trust_dominant',
  education: 'trust_dominant',
  skills: 'union',
}

/**
 * Age at which a volatile claim is worth half as much. 18 months is chosen against
 * how people actually move: median tenure in the roles this pool covers runs 2–3
 * years, so a claim older than about a year and a half is more likely than not to
 * describe a job someone has already left.
 */
export const HALF_LIFE_MONTHS = 18

/**
 * A runner-up scoring at least this fraction of the winner is close enough that
 * recency has NOT resolved the conflict — so we surface the disagreement instead of
 * silently picking. Below it, the winner is clearly better evidence and flagging
 * would just be noise.
 *
 * This is deliberately narrower than migration 115's original reading ("two sources
 * name different employers → disputed"). Under that rule a 2019 résumé permanently
 * disputes a 2026 vendor record, which is not a real conflict — it's just old.
 */
export const DISPUTE_RATIO = 0.6

export function monthsBetween(iso: string, now: Date): number {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return 0
  return Math.max(0, (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth()))
}

/** Exponential decay by age. 1.0 when fresh, 0.5 at one half-life. PURE. */
export function recencyDecay(observedAt: string, now: Date, halfLifeMonths = HALF_LIFE_MONTHS): number {
  return Math.pow(0.5, monthsBetween(observedAt, now) / halfLifeMonths)
}

/** Resolve the trust weight for one (source, field). PURE. */
export function trustFor(
  sourceKey: string,
  field: string,
  sourceTrust: Record<string, number>,
  fieldTrust: Record<string, number>,
): number {
  const override = fieldTrust[`${sourceKey}:${field}`]
  return override ?? sourceTrust[sourceKey] ?? 50
}

/** score = trust × recency × confidence. PURE. */
export function claimScore(
  claim: StoredClaim,
  policy: FieldPolicy,
  trust: number,
  now: Date,
): number {
  const decay = policy === 'recency_dominant' ? recencyDecay(claim.observed_at, now) : 1
  const conf = Math.max(0, Math.min(100, claim.confidence)) / 100
  return trust * decay * conf
}

export interface FusedField {
  field: string
  value: unknown
  /** Which source won. Null for a union field, where no single source "wins". */
  sourceKey: string | null
  score: number
  /** Two credible sources disagree and recency didn't settle it. */
  disputed: boolean
  /** Newest observation among the claims that contributed to this value. */
  observedAt: string | null
}

/** True when two claim values mean materially different things. PURE. */
function differs(a: unknown, b: unknown): boolean {
  if (a == null || b == null) return false
  if (typeof a === 'string' && typeof b === 'string') {
    return a.trim().toLowerCase() !== b.trim().toLowerCase()
  }
  if (typeof a === 'number' && typeof b === 'number') {
    // Years of experience differing by a rounding step is not a conflict.
    return Math.abs(a - b) > 1
  }
  return JSON.stringify(a) !== JSON.stringify(b)
}

function isEmpty(v: unknown): boolean {
  if (v == null) return true
  if (typeof v === 'string') return v.trim() === ''
  if (Array.isArray(v)) return v.length === 0
  return false
}

/**
 * Fuse every claim for one field into one value. PURE.
 *
 * Union fields merge case-insensitively but keep the first spelling seen from the
 * most-trusted source, so "Node.js" doesn't become "node.js" just because a weaker
 * source shouted louder.
 */
export function fuseField(
  field: string,
  claims: StoredClaim[],
  sourceTrust: Record<string, number>,
  fieldTrust: Record<string, number>,
  now: Date,
): FusedField | null {
  const usable = claims.filter((c) => c.field === field && !isEmpty(c.value))
  if (!usable.length) return null

  const policy = FIELD_POLICY[field as ClaimField] ?? 'trust_dominant'
  const scored = usable
    .map((c) => ({ c, score: claimScore(c, policy, trustFor(c.source_key, field, sourceTrust, fieldTrust), now) }))
    .sort((a, b) => b.score - a.score || (a.c.observed_at < b.c.observed_at ? 1 : -1))

  const newest = scored.reduce<string | null>(
    (acc, s) => (acc == null || s.c.observed_at > acc ? s.c.observed_at : acc),
    null,
  )

  if (policy === 'union') {
    const seen = new Map<string, string>()
    for (const { c } of scored) {
      const items = Array.isArray(c.value) ? c.value : [c.value]
      for (const item of items) {
        if (typeof item !== 'string') continue
        const t = item.trim()
        if (!t) continue
        const key = t.toLowerCase()
        if (!seen.has(key)) seen.set(key, t)
      }
    }
    return {
      field,
      value: Array.from(seen.values()),
      sourceKey: null,
      score: scored[0].score,
      disputed: false,
      observedAt: newest,
    }
  }

  const winner = scored[0]
  // The first runner-up asserting something materially different from the winner.
  const rival = scored.slice(1).find((s) => differs(s.c.value, winner.c.value))
  const disputed = Boolean(rival && winner.score > 0 && rival.score / winner.score >= DISPUTE_RATIO)

  return {
    field,
    value: winner.c.value,
    sourceKey: winner.c.source_key,
    score: winner.score,
    disputed,
    observedAt: newest,
  }
}

/** Fuse every field present in the claim set. PURE. */
export function fuseClaims(
  claims: StoredClaim[],
  sourceTrust: Record<string, number>,
  fieldTrust: Record<string, number>,
  now: Date,
): Record<string, FusedField> {
  const out: Record<string, FusedField> = {}
  for (const field of Array.from(new Set(claims.map((c) => c.field)))) {
    const fused = fuseField(field, claims, sourceTrust, fieldTrust, now)
    if (fused) out[field] = fused
  }
  return out
}
