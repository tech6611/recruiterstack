/**
 * The vendor adapter contract (Slice S1).
 * See docs/pool-vendor-ingestion-architecture.md §2 stage 3.
 *
 * THE ONE RULE: vendors don't produce facts, they produce CLAIMS.
 *
 * An adapter never writes a profile and never decides what is true. It translates
 * one vendor's payload into this source-neutral shape and stops. Resolution
 * (who is this person?) and fusion (which claim wins?) happen downstream, from the
 * claims, under a policy that knows nothing about any particular vendor.
 *
 * That is what keeps the promise in the build plan: adding vendor #2 should touch
 * only its own folder plus a `pool_sources` row. If it ever touches resolve/fuse/
 * materialize, this contract was wrong.
 *
 * `map()` is PURE — no I/O, no DB, no network, no clock. Onboarding a vendor is
 * therefore: save real responses as fixtures, write the mapper, assert on the
 * fixtures.
 */

/** Strong identifiers — the deterministic half of identity resolution. */
export type IdentifierKind = 'email' | 'linkedin' | 'github' | 'phone'

export interface Identifier {
  kind: IdentifierKind
  /** Raw, as the vendor gave it. Normalization happens in identity.ts, not here. */
  value: string
}

/**
 * One source's assertion about one field, at one point in time.
 *
 * `observedAt` MUST come from the source — the vendor's own "last updated" date,
 * a résumé's document date — and never from the wall clock. Two reasons: fusion
 * decays claims by age, and the (profile, field, source, observed_at) unique index
 * is what makes a re-run idempotent. A now() default would make every re-run write
 * a new row and silently give the same source extra votes.
 */
export interface Claim {
  field: ClaimField
  value: unknown
  /** ISO date (YYYY-MM-DD) or full timestamp. */
  observedAt: string
  /** 0–100. The vendor's own confidence where it publishes one, else a mapper heuristic. */
  confidence: number
}

/**
 * The fields the pool projects. Kept as a union rather than free strings so a typo
 * in an adapter is a compile error rather than a claim nothing ever reads.
 */
export const CLAIM_FIELDS = [
  'display_name',
  'headline',
  'location',
  'current_title',
  'current_company',
  'experience_years',
  'skills',
  'education',
] as const
export type ClaimField = (typeof CLAIM_FIELDS)[number]

/** Same shape as pool_experiences / candidate_experiences, so nothing translates. */
export interface CanonicalExperience {
  title: string | null
  employer: string | null
  location: string | null
  /** YYYY-MM-DD, first of the month. Null when the vendor gave nothing usable. */
  startDate: string | null
  endDate: string | null
  isCurrent: boolean
  summary: string | null
}

export interface CanonicalEducation {
  degree: string | null
  field: string | null
  school: string | null
  year: number | null
}

export interface CanonicalContact {
  kind: 'email' | 'linkedin' | 'phone' | 'website'
  value: string
  /** high | review | ambiguous — mirrors pool_contacts.confidence. */
  confidence?: 'high' | 'review' | 'ambiguous'
}

/** What an adapter returns. Source-neutral by construction. */
export interface MappedRecord {
  /** The vendor's own record id. Half of the ledger's primary key. */
  externalId: string
  /** Canonical URL for the record, when the vendor exposes one. */
  url: string | null
  identifiers: Identifier[]
  claims: Claim[]
  experiences: CanonicalExperience[]
  education: CanonicalEducation[]
  contacts: CanonicalContact[]
  /**
   * The vendor's own "this record was last refreshed" date (YYYY-MM-DD).
   * THE freshness anchor: it becomes pool_profiles.evidence_as_of, from which
   * tenure_verified_months is derived. Returning null here is honest but costly —
   * the profile then has no evidence date and reads as unknown freshness.
   */
  vendorUpdatedAt: string | null
}

export interface VendorAdapter {
  /** Must match a pool_sources.key row, e.g. 'vendor:coresignal'. */
  readonly sourceKey: string
  /**
   * Translate one raw vendor payload. PURE.
   * Throws {@link VendorMapError} when the payload is unusable — the caller marks
   * the ledger row 'unusable' so we never pay for that id again.
   */
  map(payload: unknown): MappedRecord
}

/** A payload we were charged for but cannot turn into anything. */
export class VendorMapError extends Error {
  constructor(
    message: string,
    readonly externalId?: string,
  ) {
    super(message)
    this.name = 'VendorMapError'
  }
}

/**
 * Minimum bar for a record to be worth a profile row. A vendor record with no name
 * AND no employment history is a charged fetch that resolved to nothing — the
 * caller records it as 'unusable' rather than creating an empty profile that
 * pollutes search results forever.
 */
export function isUsable(r: MappedRecord): boolean {
  const hasName = r.claims.some((c) => c.field === 'display_name' && typeof c.value === 'string' && c.value.trim())
  const hasHistory = r.experiences.length > 0
  const hasIdentity = r.identifiers.length > 0
  return Boolean((hasName || hasHistory) && hasIdentity)
}
