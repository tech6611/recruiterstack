import { describe, it, expect } from 'vitest'
import { mockVendorAdapter } from './adapter'
import {
  FIXTURE_COMPLETE,
  FIXTURE_DUPLICATE_STALE,
  FIXTURE_LOOSE_DATES,
  FIXTURE_NO_EMAIL,
  FIXTURE_UNUSABLE,
  ALL_FIXTURES,
} from './fixtures'
import { isUsable, VendorMapError, CLAIM_FIELDS } from '@/modules/pool/vendors/types'
import { normalizeIdentifiers } from '@/modules/pool/domain/identity'

const map = (p: unknown) => mockVendorAdapter.map(p)

describe('MockVendorAdapter — the contract', () => {
  it('is pure: the same payload maps to the same record, always', () => {
    // No clock, no randomness. This is what makes a mapper re-run free.
    expect(map(FIXTURE_COMPLETE)).toEqual(map(FIXTURE_COMPLETE))
  })

  it('never invents a date — observedAt comes from the vendor stamp', () => {
    const r = map(FIXTURE_COMPLETE)
    expect(r.vendorUpdatedAt).toBe('2026-07-15')
    for (const c of r.claims) expect(c.observedAt).toBe('2026-07-15')
  })

  it('falls back to the newest asserted date when the vendor gives no stamp', () => {
    // Honest lower bound on when the source must have been written. Using now()
    // here would fake freshness and re-create the migration-117 tenure bug.
    const r = map({ ...FIXTURE_COMPLETE, last_updated_at: null })
    expect(r.vendorUpdatedAt).toBeNull()
    expect(r.claims[0].observedAt).toBe('2023-04-01') // the current role's start
  })

  it('only emits fields declared in the claim union', () => {
    for (const f of ALL_FIXTURES) {
      let rec
      try {
        rec = map(f)
      } catch {
        continue
      }
      for (const c of rec.claims) expect(CLAIM_FIELDS).toContain(c.field)
    }
  })
})

describe('MockVendorAdapter — mapping', () => {
  it('maps the complete record', () => {
    const r = map(FIXTURE_COMPLETE)
    expect(r.externalId).toBe('90001')
    const by = Object.fromEntries(r.claims.map((c) => [c.field, c.value]))
    expect(by.display_name).toBe('Asha Rao')
    expect(by.current_title).toBe('Engineering Manager')
    expect(by.current_company).toBe('Razorpay Software Private Limited')
    expect(by.experience_years).toBe(10.2)
    expect(r.experiences).toHaveLength(3)
    expect(r.education[0]).toEqual({ degree: 'B.E.', field: 'Computer Science', school: 'BITS Pilani', year: 2016 })
  })

  it('does NOT normalize the employer — that is fusion/rebuild territory', () => {
    // An adapter reports what the vendor said. Normalizing here would destroy the
    // raw claim and make provenance a lie.
    const by = Object.fromEntries(map(FIXTURE_COMPLETE).claims.map((c) => [c.field, c.value]))
    expect(by.current_company).toBe('Razorpay Software Private Limited')
  })

  it('de-duplicates skills case-insensitively, keeping the first spelling', () => {
    const by = Object.fromEntries(map(FIXTURE_COMPLETE).claims.map((c) => [c.field, c.value]))
    expect(by.skills).toEqual(['Go', 'Kubernetes', 'PostgreSQL', 'Distributed Systems'])
  })

  it('puts the current role first, then most recent start', () => {
    const r = map(FIXTURE_COMPLETE)
    expect(r.experiences.map((e) => e.employer)).toEqual([
      'Razorpay Software Private Limited',
      'Flipkart Internet Pvt Ltd',
      'Infosys',
    ])
    expect(r.experiences[0].isCurrent).toBe(true)
    expect(r.experiences[0].endDate).toBeNull()
    expect(r.experiences[1].endDate).toBe('2023-03-01')
  })

  it('handles the loose dates a vendor really sends, without faking precision', () => {
    const r = map(FIXTURE_LOOSE_DATES)
    const byTitle = Object.fromEntries(r.experiences.map((e) => [e.title, e]))
    expect(byTitle['Head of Growth'].startDate).toBe('2021-01-01') // bare year
    expect(byTitle['Head of Growth'].isCurrent).toBe(true)
    expect(byTitle['Head of Growth'].endDate).toBeNull() // "Present"
    expect(byTitle['Growth Lead'].startDate).toBe('2018-01-01')
    expect(byTitle['Growth Lead'].endDate).toBe('2020-12-01')
    // No dates at all stays null rather than being guessed.
    expect(byTitle['Consultant'].startDate).toBeNull()
    expect(byTitle['Consultant'].endDate).toBeNull()
  })
})

describe('MockVendorAdapter — identity', () => {
  it('emits identifiers that resolve two vendor records onto one human', () => {
    // The pre-buy ledger dedupes within a vendor; THIS is what dedupes across them.
    const a = normalizeIdentifiers(map(FIXTURE_COMPLETE).identifiers)
    const b = normalizeIdentifiers(map(FIXTURE_DUPLICATE_STALE).identifiers)
    expect(a.find((i) => i.kind === 'email')!.value).toBe('asharao@gmail.com')
    expect(b.find((i) => i.kind === 'email')!.value).toBe('asharao@gmail.com')
    expect(map(FIXTURE_COMPLETE).externalId).not.toBe(map(FIXTURE_DUPLICATE_STALE).externalId)
  })

  it('keeps someone reachable by LinkedIn alone', () => {
    const r = map(FIXTURE_NO_EMAIL)
    expect(r.contacts.some((c) => c.kind === 'email')).toBe(false)
    expect(r.contacts.some((c) => c.kind === 'linkedin')).toBe(true)
    expect(isUsable(r)).toBe(true)
  })
})

describe('MockVendorAdapter — the charged-but-worthless case', () => {
  it('maps without throwing but reports itself unusable', () => {
    // Coresignal bills on HTTP 200, so this record cost money. It must be
    // recordable, or the pre-buy check never learns we paid and we buy it forever.
    const r = map(FIXTURE_UNUSABLE)
    expect(r.claims).toHaveLength(0)
    expect(r.experiences).toHaveLength(0)
    expect(r.identifiers).toHaveLength(0)
    expect(isUsable(r)).toBe(false)
  })

  it('throws VendorMapError when there is no id at all', () => {
    expect(() => map({ full_name: 'No Id' })).toThrow(VendorMapError)
    expect(() => map(null)).toThrow(VendorMapError)
  })

  it('throws VendorMapError when no date can be attributed', () => {
    expect(() => map({ id: 1, full_name: 'Undated Person' })).toThrow(VendorMapError)
  })

  it('a record with a name but no identifier is unusable, not an error', () => {
    // We can't resolve it and can't contact them — a profile row would be noise.
    const r = map({ id: 7, full_name: 'Anon', last_updated_at: '2026-01-01' })
    expect(isUsable(r)).toBe(false)
  })
})
