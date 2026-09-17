import { describe, it, expect } from 'vitest'
import { crustdataAdapter } from './adapter'
import { FIXTURE_COMPLETE, FIXTURE_NO_STAMP, FIXTURE_GITHUB_ONLY, FIXTURE_UNUSABLE, ALL_FIXTURES } from './fixtures'
import { isUsable, VendorMapError, CLAIM_FIELDS } from '@/modules/pool/vendors/types'
import { normalizeIdentifiers } from '@/modules/pool/domain/identity'

const map = (p: unknown) => crustdataAdapter.map(p)

describe('CrustdataAdapter — the contract', () => {
  it('is pure: the same payload maps to the same record, always', () => {
    expect(map(FIXTURE_COMPLETE)).toEqual(map(FIXTURE_COMPLETE))
  })

  it('never invents a date — observedAt comes from metadata.updated_at', () => {
    const r = map(FIXTURE_COMPLETE)
    expect(r.vendorUpdatedAt).toBe('2026-09-15')
    for (const c of r.claims) expect(c.observedAt).toBe('2026-09-15')
  })

  it('falls back to the newest asserted date when the vendor gives no stamp', () => {
    const r = map(FIXTURE_NO_STAMP)
    expect(r.vendorUpdatedAt).toBeNull()
    // Mercor's start (2026-03-01) is the newest date the record asserts.
    for (const c of r.claims) expect(c.observedAt).toBe('2026-03-01')
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

describe('CrustdataAdapter — mapping', () => {
  it('maps the complete record', () => {
    const r = map(FIXTURE_COMPLETE)
    expect(r.externalId).toBe('1410707')
    expect(r.url).toBe('https://www.linkedin.com/in/robin-singh-35797a166')
    const by = Object.fromEntries(r.claims.map((c) => [c.field, c.value]))
    expect(by.display_name).toBe('Robin Singh')
    expect(by.current_title).toBe('Senior Software Engineer (Backend, AI & Full-Stack)')
    // is_default (Vimeo) wins over the later-started concurrent Mercor role.
    expect(by.current_company).toBe('Vimeo')
    expect(by.education).toEqual([
      { degree: 'Bachelor of Technology - BTech', field: null, school: 'Lovely Professional University', year: 2021 },
    ])
  })

  it('omits experience_years when the vendor did not send a number', () => {
    const by = Object.fromEntries(map(FIXTURE_COMPLETE).claims.map((c) => [c.field, c.value]))
    expect('experience_years' in by).toBe(false)
  })

  it('emits experience_years when the vendor did send a number', () => {
    const by = Object.fromEntries(map(FIXTURE_GITHUB_ONLY).claims.map((c) => [c.field, c.value]))
    expect(by.experience_years).toBe(12)
  })

  it('does NOT normalize the employer — that is fusion/rebuild territory', () => {
    const by = Object.fromEntries(map(FIXTURE_COMPLETE).claims.map((c) => [c.field, c.value]))
    expect(by.current_company).toBe('Vimeo')
  })

  it('orders roles: primary current first, then concurrent, then past by recency', () => {
    const r = map(FIXTURE_COMPLETE)
    expect(r.experiences.map((e) => e.employer)).toEqual(['Vimeo', 'Mercor', 'Internshala', 'Internshala'])
    expect(r.experiences[0].isCurrent).toBe(true)
    expect(r.experiences[0].endDate).toBeNull() // Vimeo, open-ended
    expect(r.experiences[1].isCurrent).toBe(true) // Mercor, concurrent
    expect(r.experiences[2].endDate).toBe('2023-05-01') // most recent past role
  })

  it('does not emit a skills claim from a search payload (search returns none)', () => {
    const by = Object.fromEntries(map(FIXTURE_COMPLETE).claims.map((c) => [c.field, c.value]))
    expect('skills' in by).toBe(false)
  })
})

describe('CrustdataAdapter — identity', () => {
  it('is usable on LinkedIn alone', () => {
    const r = map(FIXTURE_COMPLETE)
    const ids = normalizeIdentifiers(r.identifiers)
    expect(ids.some((i) => i.kind === 'linkedin')).toBe(true)
    expect(r.contacts.some((c) => c.kind === 'email')).toBe(false)
    expect(isUsable(r)).toBe(true)
  })

  it('is usable on GitHub alone, and emits a github identifier', () => {
    const r = map(FIXTURE_GITHUB_ONLY)
    expect(r.identifiers.some((i) => i.kind === 'github')).toBe(true)
    expect(r.identifiers.some((i) => i.kind === 'linkedin')).toBe(false)
    expect(isUsable(r)).toBe(true)
  })
})

describe('CrustdataAdapter — the charged-but-worthless case', () => {
  it('maps without throwing but reports itself unusable', () => {
    const r = map(FIXTURE_UNUSABLE)
    expect(r.claims).toHaveLength(0)
    expect(r.experiences).toHaveLength(0)
    expect(r.identifiers).toHaveLength(0)
    expect(isUsable(r)).toBe(false)
  })

  it('throws VendorMapError when there is no crustdata_person_id', () => {
    expect(() => map({ basic_profile: { name: 'No Id' } })).toThrow(VendorMapError)
    expect(() => map(null)).toThrow(VendorMapError)
  })

  it('throws VendorMapError when no date can be attributed', () => {
    expect(() => map({ crustdata_person_id: 1, basic_profile: { name: 'Undated Person' } })).toThrow(VendorMapError)
  })

  it('a record with a name but no identifier is unusable, not an error', () => {
    const r = map({ crustdata_person_id: 7, basic_profile: { name: 'Anon' }, metadata: { updated_at: '2026-01-01T00:00:00+00:00' } })
    expect(isUsable(r)).toBe(false)
  })
})
