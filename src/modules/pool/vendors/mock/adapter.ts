/**
 * `vendor:mock` — the fixture-backed adapter (S1).
 *
 * Exists so the entire ingest spine (land → map → resolve → fuse → materialize) can
 * be exercised, tested and demoed with zero vendor spend. It is also the reference
 * implementation: the Coresignal adapter should read as a small diff from this file.
 *
 * PURE. No I/O, no DB, no network, no clock — every date it emits comes from the
 * payload. See vendors/types.ts for why that matters.
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
import type { MockVendorPayload } from '@/modules/pool/vendors/mock/fixtures'

/** ISO date (YYYY-MM-DD) or null. Vendors send dates in whatever shape they like. */
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
 * Confidence heuristic. A real vendor that publishes its own per-field confidence
 * should pass that through instead; this is the fallback for one that doesn't.
 * Fields the vendor derives itself (an "active experience" rollup) are trusted less
 * than fields it read straight off a source document.
 */
const DIRECT = 85
const DERIVED = 70

export class MockVendorAdapter implements VendorAdapter {
  readonly sourceKey = 'vendor:mock'

  map(payload: unknown): MappedRecord {
    const p = payload as MockVendorPayload
    if (!p || typeof p !== 'object' || p.id == null || p.id === '') {
      throw new VendorMapError('payload has no vendor id')
    }
    const externalId = String(p.id)

    // The vendor's own freshness stamp. Everything downstream — evidence_as_of,
    // tenure_verified_months, the staleness UI — hangs off this one date, so a
    // record without it is honest-but-blind rather than an error.
    const observedAt = isoDay(p.last_updated_at) ?? null

    // A claim needs a date. With no vendor stamp we fall back to the newest date the
    // record itself asserts (the latest role start), which is a lower bound on when
    // the source must have been written. Never now(): that would fake freshness.
    const roleStarts = (p.experience ?? [])
      .map((e) => isoDay(e.date_from))
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

    // De-duplicate case-insensitively, keeping the FIRST spelling seen. Building
    // this with `new Map(pairs)` would silently keep the LAST one instead, so
    // ['Go', 'go'] would surface as 'go'.
    const skillsByKey = new Map<string, string>()
    for (const raw of p.inferred_skills ?? []) {
      const s = clean(raw)
      if (!s) continue
      const key = s.toLowerCase()
      if (!skillsByKey.has(key)) skillsByKey.set(key, s)
    }
    const skills = Array.from(skillsByKey.values())

    const experiences: CanonicalExperience[] = (p.experience ?? []).map((e) => {
      const endRaw = clean(e.date_to)
      const isCurrent = e.active_experience === 1 || /present|current|now/i.test(endRaw ?? '')
      return {
        title: clean(e.position_title),
        employer: clean(e.company_name),
        location: clean(e.location),
        startDate: isoDay(e.date_from),
        endDate: isCurrent ? null : isoDay(e.date_to),
        isCurrent,
        summary: clean(e.description),
      }
    })
    // Most recent first — sort_order 0 is "current", matching pool_experiences.
    experiences.sort((a, b) => {
      if (a.isCurrent !== b.isCurrent) return a.isCurrent ? -1 : 1
      return (b.startDate ?? '').localeCompare(a.startDate ?? '')
    })

    const education: CanonicalEducation[] = (p.education ?? []).map((ed) => {
      const year = Number.parseInt(String(ed.date_to ?? '').slice(0, 4), 10)
      return {
        degree: clean(ed.degree),
        field: clean(ed.field_of_study),
        school: clean(ed.institution_title),
        year: Number.isFinite(year) ? year : null,
      }
    })

    const emails = [p.primary_professional_email, ...(p.professional_emails ?? [])]
      .map(clean)
      .filter((v): v is string => Boolean(v))

    const identifiers: Identifier[] = []
    for (const e of emails) identifiers.push({ kind: 'email', value: e })
    if (clean(p.linkedin_url)) identifiers.push({ kind: 'linkedin', value: p.linkedin_url! })
    if (clean(p.phone)) identifiers.push({ kind: 'phone', value: p.phone! })

    const contacts: CanonicalContact[] = []
    for (const e of emails) contacts.push({ kind: 'email', value: e, confidence: 'high' })
    if (clean(p.linkedin_url)) contacts.push({ kind: 'linkedin', value: p.linkedin_url!, confidence: 'high' })
    if (clean(p.phone)) contacts.push({ kind: 'phone', value: p.phone!, confidence: 'review' })
    for (const w of p.websites ?? []) if (clean(w)) contacts.push({ kind: 'website', value: w, confidence: 'high' })

    const claims = [
      claim('display_name', clean(p.full_name), DIRECT),
      claim('headline', clean(p.headline), DIRECT),
      claim('location', clean(p.location_full), DIRECT),
      claim('current_title', clean(p.active_experience_title), DERIVED),
      claim('current_company', clean(p.active_experience_company), DERIVED),
      claim(
        'experience_years',
        typeof p.total_experience_months === 'number' ? Math.round((p.total_experience_months / 12) * 10) / 10 : null,
        DERIVED,
      ),
      claim('skills', skills, DERIVED),
      claim('education', education, DIRECT),
    ].filter((c): c is Claim => c !== null)

    return {
      externalId,
      url: clean(p.linkedin_url),
      identifiers,
      claims,
      experiences,
      education,
      contacts,
      vendorUpdatedAt: observedAt,
    }
  }
}

export const mockVendorAdapter = new MockVendorAdapter()
