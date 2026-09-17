import { describe, it, expect } from 'vitest'
import { fuseField, fuseClaims, recencyDecay, trustFor, HALF_LIFE_MONTHS, type StoredClaim } from './fusion'

const NOW = new Date('2026-08-01T00:00:00Z')

const SOURCE_TRUST = { 'web:resume': 85, 'vendor:mock': 65, github: 70 }
const FIELD_TRUST = {
  'vendor:mock:current_company': 80, // a vendor beats a résumé on employment...
  'github:current_company': 45, // ...and a GitHub bio string beats nothing
}

function claim(source: string, field: string, value: unknown, observed: string, confidence = 100): StoredClaim {
  return { field, value, source_key: source, observed_at: observed, confidence }
}

describe('recencyDecay', () => {
  it('halves at one half-life', () => {
    expect(recencyDecay('2026-08-01', NOW)).toBeCloseTo(1, 5)
    const oneHalfLife = new Date(NOW)
    oneHalfLife.setMonth(oneHalfLife.getMonth() - HALF_LIFE_MONTHS)
    expect(recencyDecay(oneHalfLife.toISOString(), NOW)).toBeCloseTo(0.5, 5)
  })
})

describe('trustFor', () => {
  it('prefers the per-field override, else the source default, else 50', () => {
    expect(trustFor('vendor:mock', 'current_company', SOURCE_TRUST, FIELD_TRUST)).toBe(80)
    expect(trustFor('vendor:mock', 'display_name', SOURCE_TRUST, FIELD_TRUST)).toBe(65)
    expect(trustFor('unknown:src', 'anything', SOURCE_TRUST, FIELD_TRUST)).toBe(50)
  })
})

describe('fuseField — recency_dominant', () => {
  it('lets a fresh weaker source beat a stale stronger one on a volatile field', () => {
    // This is the whole reason recency decay exists: a 2022 résumé is more trusted
    // per-source than a vendor, but it is describing a job she has since left.
    const out = fuseField(
      'current_company',
      [
        claim('web:resume', 'current_company', 'Flipkart', '2022-01-01'),
        claim('vendor:mock', 'current_company', 'Razorpay', '2026-07-15', 70),
      ],
      SOURCE_TRUST,
      FIELD_TRUST,
      NOW,
    )!
    expect(out.value).toBe('Razorpay')
    expect(out.sourceKey).toBe('vendor:mock')
  })

  it('does NOT flag a stale disagreement as disputed', () => {
    // Migration 115 read any two differing employers as a conflict. Under that rule
    // a 2022 résumé permanently disputes a 2026 record, which is not a conflict —
    // it is just old.
    const out = fuseField(
      'current_company',
      [
        claim('web:resume', 'current_company', 'Flipkart', '2022-01-01'),
        claim('vendor:mock', 'current_company', 'Razorpay', '2026-07-15', 70),
      ],
      SOURCE_TRUST,
      FIELD_TRUST,
      NOW,
    )!
    expect(out.disputed).toBe(false)
  })

  it('DOES flag it when two credible, comparably fresh sources disagree', () => {
    const out = fuseField(
      'current_company',
      [
        claim('web:resume', 'current_company', 'Zeta', '2026-06-01'),
        claim('vendor:mock', 'current_company', 'Razorpay', '2026-07-15', 70),
      ],
      SOURCE_TRUST,
      FIELD_TRUST,
      NOW,
    )!
    expect(out.value).toBe('Zeta')
    expect(out.disputed).toBe(true)
  })

  it('treats a case/whitespace difference as agreement, not conflict', () => {
    const out = fuseField(
      'current_company',
      [
        claim('web:resume', 'current_company', 'Razorpay ', '2026-06-01'),
        claim('vendor:mock', 'current_company', 'razorpay', '2026-07-15'),
      ],
      SOURCE_TRUST,
      FIELD_TRUST,
      NOW,
    )!
    expect(out.disputed).toBe(false)
  })
})

describe('fuseField — trust_dominant', () => {
  it('ignores age for facts that do not change', () => {
    const out = fuseField(
      'education',
      [
        claim('web:resume', 'education', [{ school: 'BITS Pilani' }], '2019-01-01'),
        claim('vendor:mock', 'education', [{ school: 'BITS' }], '2026-07-15'),
      ],
      SOURCE_TRUST,
      FIELD_TRUST,
      NOW,
    )!
    // The résumé is seven years older and still wins: a degree does not expire.
    expect(out.sourceKey).toBe('web:resume')
  })
})

describe('fuseField — union', () => {
  it('merges skills instead of picking a winner', () => {
    const out = fuseField(
      'skills',
      [
        claim('vendor:mock', 'skills', ['Go', 'Kubernetes', 'go'], '2026-07-15'),
        claim('web:resume', 'skills', ['Java', 'GO'], '2026-06-01'),
      ],
      SOURCE_TRUST,
      FIELD_TRUST,
      NOW,
    )!
    // De-duplicated case-insensitively, keeping the spelling from the highest
    // scoring source (web:resume outranks vendor:mock on `skills` here).
    expect(out.value).toEqual(['Java', 'GO', 'Kubernetes'])
    expect(out.disputed).toBe(false)
    expect(out.sourceKey).toBeNull()
  })
})

describe('fuseField — general', () => {
  it('ignores empty values rather than letting them win', () => {
    const out = fuseField(
      'current_title',
      [
        claim('web:resume', 'current_title', '   ', '2026-07-01'),
        claim('vendor:mock', 'current_title', 'Engineering Manager', '2026-06-01'),
      ],
      SOURCE_TRUST,
      FIELD_TRUST,
      NOW,
    )!
    expect(out.value).toBe('Engineering Manager')
  })

  it('returns null when nothing usable was claimed', () => {
    expect(fuseField('headline', [], SOURCE_TRUST, FIELD_TRUST, NOW)).toBeNull()
    expect(
      fuseField('headline', [claim('web:resume', 'headline', null, '2026-01-01')], SOURCE_TRUST, FIELD_TRUST, NOW),
    ).toBeNull()
  })

  it('reports the newest contributing observation', () => {
    const out = fuseField(
      'current_company',
      [
        claim('web:resume', 'current_company', 'Zeta', '2026-06-01'),
        claim('vendor:mock', 'current_company', 'Razorpay', '2026-07-15'),
      ],
      SOURCE_TRUST,
      FIELD_TRUST,
      NOW,
    )!
    expect(out.observedAt).toBe('2026-07-15')
  })
})

describe('fuseClaims', () => {
  it('fuses every field present and is deterministic', () => {
    const claims = [
      claim('vendor:mock', 'display_name', 'Asha Rao', '2026-07-15'),
      claim('vendor:mock', 'current_company', 'Razorpay', '2026-07-15', 70),
      claim('web:resume', 'current_company', 'Flipkart', '2022-01-01'),
      claim('vendor:mock', 'skills', ['Go'], '2026-07-15'),
    ]
    const a = fuseClaims(claims, SOURCE_TRUST, FIELD_TRUST, NOW)
    const b = fuseClaims([...claims].reverse(), SOURCE_TRUST, FIELD_TRUST, NOW)
    expect(Object.keys(a).sort()).toEqual(['current_company', 'display_name', 'skills'])
    expect(a.current_company.value).toBe('Razorpay')
    // Input order must not change the outcome.
    expect(b.current_company.value).toBe(a.current_company.value)
  })

  it('a disabled source simply is not in sourceTrust — the kill switch', () => {
    // rebuild.ts filters claims to enabled sources before calling in. Proving the
    // fallback here: an unknown source gets the neutral 50, so if it were NOT
    // filtered it could still win. Filtering, not down-weighting, is the mechanism.
    const out = fuseClaims(
      [claim('vendor:mock', 'current_company', 'Razorpay', '2026-07-15')],
      {}, // nothing enabled
      {},
      NOW,
    )
    expect(out.current_company.score).toBeGreaterThan(0)
  })
})
