/**
 * `vendor:crustdata` — adapter for Crustdata's people dataset (Slice 1).
 *
 * Translates one entry from POST /person/search `profiles[]` into the source-neutral
 * MappedRecord. Reads as a small diff from mock/adapter.ts, as the contract intends.
 *
 * PURE. No I/O, no DB, no network, no clock — every date it emits comes from the
 * payload. See vendors/types.ts for why that matters.
 *
 * Person Search does NOT return skills, emails or phones (only a
 * `contact.has_business_email` flag), so a searched record's identity is usually its
 * LinkedIn URL alone. Those richer fields arrive later via Person/Contact Enrich and
 * land as their own claims — the fusion layer will merge them onto the same profile.
 */
import {
  VendorMapError,
  type CanonicalEducation,
  type CanonicalExperience,
  type CanonicalContact,
  type Claim,
  type Identifier,
  type MappedRecord,
  type VendorAdapter,
} from '@/modules/pool/vendors/types'
import { normalizeMonth } from '@/lib/ai/candidate-enrichment'
import type { CrustdataPersonPayload, CrustRole } from '@/modules/pool/vendors/crustdata/fixtures'

/** ISO date (YYYY-MM-DD) or null. Crustdata sends full ISO timestamps; be tolerant. */
function isoDay(v: string | null | undefined): string | null {
  const s = String(v ?? '').trim()
  if (!s) return null
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m) return `${m[1]}-${m[2]}-${m[3]}`
  return normalizeMonth(s)
}

function clean(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t.length ? t : null
}

/**
 * Confidence heuristic (mirrors mock/adapter.ts). Fields Crustdata reads straight off
 * a source profile (name, headline, education) are trusted more than ones it derives
 * (the rolled-up current title/company, an experience-years number).
 */
const DIRECT = 85
const DERIVED = 70

export class CrustdataAdapter implements VendorAdapter {
  readonly sourceKey = 'vendor:crustdata'

  map(payload: unknown): MappedRecord {
    const p = payload as CrustdataPersonPayload
    if (!p || typeof p !== 'object' || p.crustdata_person_id == null || p.crustdata_person_id === '') {
      throw new VendorMapError('payload has no crustdata_person_id')
    }
    const externalId = String(p.crustdata_person_id)

    const bp = p.basic_profile ?? {}
    const ed = p.experience?.employment_details ?? {}
    const currentRoles = ed.current ?? []
    const pastRoles = ed.past ?? []

    // The vendor's own freshness stamp. Everything downstream — evidence_as_of,
    // tenure_verified_months, the staleness UI — hangs off this one date.
    const observedAt = isoDay(p.metadata?.updated_at) ?? null

    // A claim needs a date. With no vendor stamp, fall back to the newest date the
    // record itself asserts (latest role start) — a lower bound on when it was
    // written. Never now(): that would fake freshness.
    const roleStarts = [...currentRoles, ...pastRoles]
      .map((r) => isoDay(r.start_date))
      .filter((d): d is string => Boolean(d))
      .sort()
    const claimDate = observedAt ?? roleStarts.at(-1) ?? null
    if (!claimDate) {
      throw new VendorMapError('record carries no date we can attribute evidence to', externalId)
    }

    const claim = (field: Claim['field'], value: unknown, confidence: number): Claim | null =>
      value == null || (typeof value === 'string' && !value.trim()) || (Array.isArray(value) && !value.length)
        ? null
        : { field, value, observedAt: claimDate, confidence }

    // A person can hold several concurrent roles (e.g. a full-time job + a side gig).
    // `is_default` marks the primary one, which is what current_title/company describe.
    const primaryCurrent = currentRoles.find((r) => r.is_default) ?? currentRoles[0]

    const name = clean(bp.name) ?? clean([bp.first_name, bp.last_name].filter(Boolean).join(' '))

    // Every current role is open-ended; a past role with no end_date is treated as
    // ongoing too (defensive — the API normally dates past roles).
    type Tagged = { raw: CrustRole; isCurrent: boolean }
    const tagged: Tagged[] = [
      ...currentRoles.map((raw) => ({ raw, isCurrent: true })),
      ...pastRoles.map((raw) => ({ raw, isCurrent: !clean(raw.end_date) })),
    ]
    // Current first; the primary (is_default) current role before other concurrent
    // ones; then most recent start. sort_order 0 is "current", matching pool_experiences.
    tagged.sort((a, b) => {
      if (a.isCurrent !== b.isCurrent) return a.isCurrent ? -1 : 1
      const ad = a.raw.is_default ? 1 : 0
      const bd = b.raw.is_default ? 1 : 0
      if (ad !== bd) return bd - ad
      return (isoDay(b.raw.start_date) ?? '').localeCompare(isoDay(a.raw.start_date) ?? '')
    })
    const experiences: CanonicalExperience[] = tagged.map(({ raw, isCurrent }) => ({
      title: clean(raw.title),
      employer: clean(raw.name),
      location: clean(raw.location?.raw),
      startDate: isoDay(raw.start_date),
      endDate: isCurrent ? null : isoDay(raw.end_date),
      isCurrent,
      summary: clean(raw.description),
    }))

    const education: CanonicalEducation[] = (p.education?.schools ?? []).map((s) => ({
      degree: clean(s.degree),
      field: clean(s.field_of_study),
      school: clean(s.school),
      year: Number.isFinite(s.end_year as number)
        ? (s.end_year as number)
        : Number.isFinite(s.start_year as number)
          ? (s.start_year as number)
          : null,
    }))

    // De-duplicate skills case-insensitively, keeping the FIRST spelling. (Search
    // returns none; this only bites for enrich payloads passed through the same map.)
    const skillsByKey = new Map<string, string>()
    for (const raw of p.skills ?? []) {
      const s = clean(raw)
      if (!s) continue
      const key = s.toLowerCase()
      if (!skillsByKey.has(key)) skillsByKey.set(key, s)
    }
    const skills = Array.from(skillsByKey.values())

    const linkedin = clean(p.social_handles?.professional_network_identifier?.profile_url)
    const github = clean(p.social_handles?.dev_platform_identifier?.profile_url)

    const identifiers: Identifier[] = []
    if (linkedin) identifiers.push({ kind: 'linkedin', value: linkedin })
    if (github) identifiers.push({ kind: 'github', value: github })

    const contacts: CanonicalContact[] = []
    if (linkedin) contacts.push({ kind: 'linkedin', value: linkedin, confidence: 'high' })
    if (github) contacts.push({ kind: 'website', value: github, confidence: 'high' })

    const claims = [
      claim('display_name', name, DIRECT),
      claim('headline', clean(bp.headline), DIRECT),
      claim('location', clean(bp.location?.full_location) ?? clean(bp.location?.raw), DIRECT),
      claim('current_title', clean(bp.current_title) ?? clean(primaryCurrent?.title), DERIVED),
      claim('current_company', clean(primaryCurrent?.name), DERIVED),
      claim('experience_years', typeof p.years_of_experience_raw === 'number' ? p.years_of_experience_raw : null, DERIVED),
      claim('skills', skills, DERIVED),
      claim('education', education, DIRECT),
    ].filter((c): c is Claim => c !== null)

    return {
      externalId,
      url: linkedin,
      identifiers,
      claims,
      experiences,
      education,
      contacts,
      vendorUpdatedAt: observedAt,
    }
  }
}

export const crustdataAdapter = new CrustdataAdapter()
