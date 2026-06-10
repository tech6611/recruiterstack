/**
 * India tax engine — FY 2026-27 spec.
 *
 * The scenarios below pin the math. They will fail loudly when slabs,
 * rebates, or surcharges change (i.e. after every Feb budget). Update
 * the expected values *and* the engine constants together, and re-cite
 * the source in india.ts.
 *
 * Tolerance: ±₹1 per period because of round-off — engine rounds to 2
 * decimals, expected values here are integer rupees.
 */

import { describe, it, expect } from 'vitest'
import { indiaTaxEngine, computeAnnualTDS } from '../india'
import { fyFromDate } from '../registry'
import type { PayrollOrgSettings } from '@/lib/types/database'

const defaultSettings: PayrollOrgSettings = {
  org_id:                   'org_test',
  country_code:             'IN',
  default_state:            'KA',
  default_tax_regime:       'new',
  metro:                    true,
  basic_pct:                0.50,
  hra_pct_metro:            0.50,
  hra_pct_non_metro:        0.40,
  pf_employee_pct:          0.12,
  pf_wage_ceiling_enabled:  false,
  pf_wage_ceiling:          15000,
  esi_threshold:            21000,
  esi_employee_pct:         0.0075,
  notes:                    null,
  created_at:               '2026-04-01T00:00:00Z',
  updated_at:               '2026-04-01T00:00:00Z',
}

function input(overrides: Partial<Parameters<typeof indiaTaxEngine.compute>[0]>) {
  return {
    annualBaseSalary: 1_200_000,
    payFrequency: 'annual' as const,
    regime:        'new'   as const,
    periodsPerYear: 12,
    periodDays:     30,
    lwpDays:        0,
    settings:       defaultSettings,
    declaration:    null,
    ...overrides,
  }
}

describe('India tax engine — FY 2026-27 / AY 2027-28', () => {
  // ── 87A rebate boundary ───────────────────────────────────────────────────
  it('₹12L annual / new regime → ₹0 TDS (87A rebate fully absorbs slab tax)', () => {
    const out = indiaTaxEngine.compute(input({ annualBaseSalary: 1_200_000 }))
    const tds = out.deductions.find(d => d.code === 'tds')
    expect(tds).toBeUndefined()                                 // engine omits zero-TDS line
    expect(out.meta.regime).toBe('new')
    expect(out.meta.fy).toBe('2026-27')
  })

  it('₹15L annual / new regime → meaningful TDS', () => {
    const out  = indiaTaxEngine.compute(input({ annualBaseSalary: 1_500_000 }))
    const tds  = out.deductions.find(d => d.code === 'tds')!
    // Annual: taxable = 15L - 75k STD = 14.25L
    // Slabs: 4L*0 + 4L*5% + 4L*10% + 2.25L*15% = 0 + 20k + 40k + 33.75k = 93,750
    // > 12L taxable → no 87A. Cess 4% → 97,500. Monthly ≈ 8,125.
    expect(annualTDS(out)).toBeCloseTo(97_500, -2)              // tolerance ±₹50
    expect(tds.amount).toBeCloseTo(97_500 / 12, -1)
  })

  it('₹25L annual / new regime → first surcharge tier', () => {
    const out = indiaTaxEngine.compute(input({ annualBaseSalary: 2_500_000 }))
    // Taxable = 25L - 75k = 24.25L
    // Slabs (new): 4L*0 + 4L*5% + 4L*10% + 4L*15% + 4L*20% + 4L*25% + 0.25L*30%
    //            = 0 + 20k + 40k + 60k + 80k + 100k + 7.5k = 307,500
    // No 87A (>12L). No surcharge (≤50L). Cess 4% → 319,800. Monthly ≈ 26,650.
    expect(annualTDS(out)).toBeCloseTo(319_800, -2)
  })

  // ── Old regime with declarations ──────────────────────────────────────────
  it('₹5L annual / old regime + no declaration → ₹0 TDS via 87A', () => {
    const out = indiaTaxEngine.compute(input({
      annualBaseSalary: 500_000,
      regime: 'old',
      declaration: null,
    }))
    expect(annualTDS(out)).toBe(0)                              // 87A rebate clears it
  })

  it('₹10L annual / old regime + 80C 150k + 80D 25k + rent 240k → reduced TDS', () => {
    const out = indiaTaxEngine.compute(input({
      annualBaseSalary: 1_000_000,
      regime: 'old',
      declaration: {
        rent_paid_annual: 240_000,
        section_80c:      150_000,
        section_80d:       25_000,
        section_80ccd_1b:       0,
      },
    }))
    // Basic = 5L, HRA = 2.5L, rent = 2.4L.
    // HRA exemption = min(2.5L, 2.4L - 0.5L, 2.5L) = min(2.5L, 1.9L, 2.5L) = 1.9L
    // PF annual (no cap) = 12% × 5L = 60k → counts toward 80C
    // 80C effective = min(150k, 150k decl + 60k PF) = 150k (capped)
    // Taxable = 10L - 50k STD - 1.9L HRA - 150k 80C - 25k 80D = 5,85,000
    // Old slabs: 2.5L*0 + 2.5L*5% + 0.85L*20% = 12,500 + 17,000 = 29,500
    // No 87A (>5L). Cess 4% → 30,680
    expect(annualTDS(out)).toBeCloseTo(30_680, -2)
  })

  // ── PF / ESI / PT corner cases ────────────────────────────────────────────
  it('PF cap on: ₹50k Basic with cap → PF capped at ₹15k × 12% = ₹1,800', () => {
    const out = indiaTaxEngine.compute(input({
      annualBaseSalary: 1_200_000,                              // monthly = 1L, Basic = 50k
      settings: { ...defaultSettings, pf_wage_ceiling_enabled: true },
    }))
    const pf = out.deductions.find(d => d.code === 'pf')!
    expect(pf.amount).toBe(1800)                                // 15,000 × 12%
  })

  it('PF cap off: ₹50k Basic → PF = ₹6,000', () => {
    const out = indiaTaxEngine.compute(input({ annualBaseSalary: 1_200_000 }))
    const pf  = out.deductions.find(d => d.code === 'pf')!
    expect(pf.amount).toBe(6000)
  })

  it('ESI applies only at/below ₹21k monthly gross', () => {
    // ₹20k monthly = ₹2.4L annual → ESI applies
    const below = indiaTaxEngine.compute(input({ annualBaseSalary: 240_000 }))
    expect(below.deductions.find(d => d.code === 'esi')).toBeTruthy()

    // ₹25k monthly = ₹3L annual → no ESI
    const above = indiaTaxEngine.compute(input({ annualBaseSalary: 300_000 }))
    expect(above.deductions.find(d => d.code === 'esi')).toBeUndefined()
  })

  it('Karnataka PT: ₹0 below ₹25k threshold, ₹200 above (Apr 2025+)', () => {
    const below = indiaTaxEngine.compute(input({ annualBaseSalary: 240_000 }))   // 20k/mo
    expect(below.deductions.find(d => d.code === 'professional_tax')).toBeUndefined()

    const above = indiaTaxEngine.compute(input({ annualBaseSalary: 600_000 }))   // 50k/mo
    const pt    = above.deductions.find(d => d.code === 'professional_tax')!
    expect(pt.amount).toBe(200)
  })

  it('Delhi: no professional tax', () => {
    const out = indiaTaxEngine.compute(input({
      annualBaseSalary: 1_200_000,
      settings: { ...defaultSettings, default_state: 'DL' },
    }))
    expect(out.deductions.find(d => d.code === 'professional_tax')).toBeUndefined()
  })

  // ── LWP ───────────────────────────────────────────────────────────────────
  it('5 LWP days on a 30-day period @ ₹1L gross → ₹16,666.67 deduction', () => {
    const out = indiaTaxEngine.compute(input({
      annualBaseSalary: 1_200_000,                              // ₹1L/month
      lwpDays: 5,
      periodDays: 30,
    }))
    const lwp = out.deductions.find(d => d.code === 'lwp')!
    expect(lwp.amount).toBeCloseTo(16_666.67, 2)
  })

  // ── Hourly = explicit error ───────────────────────────────────────────────
  it('hourly pay frequency → explicit error', () => {
    expect(() => indiaTaxEngine.compute(input({ payFrequency: 'hourly' })))
      .toThrow(/hourly pay/i)
  })

  // ── Direct computeAnnualTDS — granular slab coverage ──────────────────────
  describe('computeAnnualTDS (raw)', () => {
    it('new regime, ₹4L gross → ₹0 (below slab)', () => {
      expect(computeAnnualTDS({
        annualGross: 400_000, basicAnnual: 200_000, hraAnnual: 100_000,
        pfAnnual: 0, regime: 'new', metro: true, declaration: null,
      })).toBe(0)
    })
    it('old regime, ₹3L gross → ₹0 (87A absorbs)', () => {
      expect(computeAnnualTDS({
        annualGross: 300_000, basicAnnual: 150_000, hraAnnual: 75_000,
        pfAnnual: 0, regime: 'old', metro: true, declaration: null,
      })).toBe(0)
    })
  })
})

// ── FY helper ──────────────────────────────────────────────────────────────
describe('fyFromDate', () => {
  it('April → that calendar year is FY start', () => {
    expect(fyFromDate('2026-04-01')).toBe('2026-27')
  })
  it('March → previous calendar year is FY start', () => {
    expect(fyFromDate('2026-03-31')).toBe('2025-26')
  })
  it('January → previous calendar year is FY start', () => {
    expect(fyFromDate('2026-01-15')).toBe('2025-26')
  })
})

// ── v1.1 sections: 24(b) / 80E / 80G / 80TTA ─────────────────────────────────
//
// Baseline for old-regime ₹15L: from the engine — Basic 7.5L, HRA 3.75L
// (no rent declared so HRA exemption = 0), PF 90k counts toward 80C.
// Without v1.1 sections, taxable = 15L − 50k − min(150k, 0 + 90k=90k)
//                                = 15L − 50k − 90k = 13,60,000
// Old slabs on 13,60,000: 2.5L*0 + 2.5L*5% + 5L*20% + 3.6L*30%
//                       = 12,500 + 1,00,000 + 1,08,000 = 2,20,500
// > 5L → no 87A. Cess 4% → 2,29,320. We use this as the baseline below.
//
// Each section reduces taxable; tax saved on the marginal slab (30%) plus
// cess (×1.04). Asserting on annualTDS keeps the test resilient if we
// later change rounding.

describe('India engine — v1.1 sections (old regime extras)', () => {
  const baseDecl = {
    rent_paid_annual:  0,
    section_80c:       0,
    section_80d:       0,
    section_80ccd_1b:  0,
  }
  const baseInput = {
    annualBaseSalary: 1_500_000,
    regime:           'old' as const,
  }

  function tdsFor(other: Record<string, number>): number {
    const out = indiaTaxEngine.compute(input({
      ...baseInput,
      declaration: { ...baseDecl, other_exemptions: other },
    }))
    return annualTDS(out)
  }

  // Sanity baseline — re-derive the no-extras number so a regression in the
  // baseline math surfaces here too.
  const BASELINE = tdsFor({})
  it('baseline (no v1.1 sections) ≈ ₹2,29,320', () => {
    expect(BASELINE).toBeCloseTo(2_29_320, -2)
  })

  // ── 24(b) — home loan interest, ₹2L cap ─────────────────────────────────
  it('24(b) ₹2L home-loan interest → tax saved ≈ ₹62,400', () => {
    // 2L × 30% slab = 60k, ×1.04 cess = 62,400
    expect(BASELINE - tdsFor({ '24b': 200_000 })).toBeCloseTo(62_400, -1)
  })

  it('24(b) caps at ₹2L — claiming ₹5L = same as claiming ₹2L', () => {
    expect(tdsFor({ '24b': 500_000 })).toBe(tdsFor({ '24b': 200_000 }))
  })

  // ── 80E — education loan, no cap ────────────────────────────────────────
  it('80E ₹3L education-loan interest → tax saved ≈ ₹93,600 (uncapped)', () => {
    // 3L × 30% × 1.04 = 93,600
    expect(BASELINE - tdsFor({ '80e': 300_000 })).toBeCloseTo(93_600, -1)
  })

  // ── 80G — donations, simplified 50% rule ────────────────────────────────
  it('80G ₹1L donations → tax saved ≈ ₹15,600 (₹50k effective deduction)', () => {
    // 1L × 50% rule = 50k effective deduction; 50k × 30% × 1.04 = 15,600
    expect(BASELINE - tdsFor({ '80g': 100_000 })).toBeCloseTo(15_600, -1)
  })

  it('80G surfaces a simplification note on the payslip', () => {
    const out = indiaTaxEngine.compute(input({
      ...baseInput,
      declaration: { ...baseDecl, other_exemptions: { '80g': 100_000 } },
    }))
    expect(out.meta.notes?.some(n => n.includes('80G'))).toBe(true)
  })

  // ── 80TTA — savings interest, ₹10k cap ──────────────────────────────────
  it('80TTA ₹10k → tax saved ≈ ₹3,120', () => {
    // 10k × 30% × 1.04 = 3,120
    expect(BASELINE - tdsFor({ '80tta': 10_000 })).toBeCloseTo(3_120, -1)
  })

  it('80TTA caps at ₹10k — claiming ₹20k = same as ₹10k', () => {
    expect(tdsFor({ '80tta': 20_000 })).toBe(tdsFor({ '80tta': 10_000 }))
  })

  // ── All four together — additive across slab boundaries ────────────────
  it('24(b)+80E+80G+80TTA combined → ₹1,53,920 saved (crosses ₹10L slab)', () => {
    const saved = BASELINE - tdsFor({
      '24b':   200_000,                                         // → 2,00,000 deduction
      '80e':   300_000,                                         // → 3,00,000 deduction
      '80g':   100_000,                                         // → 50,000 deduction (50% rule)
      '80tta':  10_000,                                         // → 10,000 deduction
    })
    // Total deduction = 5,60,000. Baseline taxable 13,60,000 → new 8,00,000.
    // Slab savings: 3.6L at 30% off (1,08,000) + 2L at 20% off (40,000)
    //             = 1,48,000 → with 4% cess = 1,53,920.
    expect(saved).toBeCloseTo(1_53_920, -1)
  })

  // ── New regime ignores all v1.1 sections ────────────────────────────────
  it('new regime ignores other_exemptions entirely', () => {
    const withExtras = indiaTaxEngine.compute(input({
      regime: 'new',
      declaration: { ...baseDecl, other_exemptions: { '24b': 200_000, '80e': 300_000 } },
    }))
    const without = indiaTaxEngine.compute(input({
      regime: 'new',
      declaration: null,
    }))
    expect(annualTDS(withExtras)).toBe(annualTDS(without))
  })

  // ── Unknown jsonb keys are ignored (forward compat) ─────────────────────
  it('unknown keys in other_exemptions are silently ignored', () => {
    const out = indiaTaxEngine.compute(input({
      ...baseInput,
      declaration: { ...baseDecl, other_exemptions: { 'made_up_section': 999_999 } },
    }))
    expect(annualTDS(out)).toBe(BASELINE)
  })
})

// ── v1.2: 80U / 80DD / 80DDB — severity + senior caps ──────────────────────
//
// Same ₹15L baseline as v1.1 (taxable = 13,60,000 → TDS ≈ ₹2,29,320). The
// caps in this block determine how much of each input gets deducted. All
// savings inside this block fall in the 30% slab + 4% cess (because none
// of these deductions cross the ₹10L slab boundary alone).
//   1 rupee saved = 1 × 0.30 × 1.04 = ₹0.312 in tax.
// So 75k cap → 23,400 saved; 1.25L cap → 39,000 saved; 40k → 12,480;
// 1L → 31,200. We use these as the assertion targets below.

describe('India engine — v1.2 sections (disability / specified diseases)', () => {
  const baseDecl = {
    rent_paid_annual:  0,
    section_80c:       0,
    section_80d:       0,
    section_80ccd_1b:  0,
  }
  const baseInput = {
    annualBaseSalary: 1_500_000,
    regime:           'old' as const,
  }

  function tdsFor(other: Record<string, number>): number {
    const out = indiaTaxEngine.compute(input({
      ...baseInput,
      declaration: { ...baseDecl, other_exemptions: other },
    }))
    return annualTDS(out)
  }
  const BASELINE = tdsFor({})

  // ── 80U self disability ─────────────────────────────────────────────────
  it('80U normal: ₹75k cap → ₹23,400 saved', () => {
    expect(BASELINE - tdsFor({ '80u': 75_000 })).toBeCloseTo(23_400, -1)
  })
  it('80U normal: claim over cap clamps to ₹75k', () => {
    expect(tdsFor({ '80u': 200_000 })).toBe(tdsFor({ '80u': 75_000 }))
  })
  it('80U severe: cap jumps to ₹1.25L → ₹39,000 saved', () => {
    expect(BASELINE - tdsFor({ '80u': 1_25_000, '80u_severe': 1 })).toBeCloseTo(39_000, -1)
  })
  it('80U severe: claim over ₹1.25L still clamps to ₹1.25L', () => {
    expect(tdsFor({ '80u': 200_000, '80u_severe': 1 })).toBe(tdsFor({ '80u': 1_25_000, '80u_severe': 1 }))
  })

  // ── 80DD disabled dependent ─────────────────────────────────────────────
  it('80DD severe: cap jumps to ₹1.25L → ₹39,000 saved', () => {
    expect(BASELINE - tdsFor({ '80dd': 1_25_000, '80dd_severe': 1 })).toBeCloseTo(39_000, -1)
  })

  // ── 80DDB specified diseases ────────────────────────────────────────────
  it('80DDB under 60: ₹40k cap → ₹12,480 saved', () => {
    expect(BASELINE - tdsFor({ '80ddb': 40_000 })).toBeCloseTo(12_480, -1)
  })
  it('80DDB senior: cap jumps to ₹1L → ₹31,200 saved', () => {
    expect(BASELINE - tdsFor({ '80ddb': 1_00_000, '80ddb_senior': 1 })).toBeCloseTo(31_200, -1)
  })
  it('80DDB senior: claim over ₹1L clamps to ₹1L', () => {
    expect(tdsFor({ '80ddb': 5_00_000, '80ddb_senior': 1 })).toBe(tdsFor({ '80ddb': 1_00_000, '80ddb_senior': 1 }))
  })

  // ── New regime ignores these too ────────────────────────────────────────
  it('new regime ignores 80U/80DD/80DDB completely', () => {
    const withClaims = indiaTaxEngine.compute(input({
      regime: 'new',
      declaration: { ...baseDecl, other_exemptions: { '80u': 1_25_000, '80u_severe': 1, '80ddb': 1_00_000, '80ddb_senior': 1 } },
    }))
    const without = indiaTaxEngine.compute(input({ regime: 'new', declaration: null }))
    expect(annualTDS(withClaims)).toBe(annualTDS(without))
  })

  // ── Combined v1.1 + v1.2 — all eight sections fire additively ───────────
  it('combined v1.1 + v1.2 sections — additive deductions cross ₹10L boundary', () => {
    const saved = BASELINE - tdsFor({
      '24b':         200_000,  // → 2,00,000
      '80e':         300_000,  // → 3,00,000
      '80g':         100_000,  // → 50,000 (50% rule)
      '80tta':        10_000,  // → 10,000
      '80u':          75_000,  // → 75,000
      '80dd':         75_000,  // → 75,000
      '80ddb':        40_000,  // → 40,000
    })
    // Total deduction = 7,50,000. Taxable: 13,60,000 → 6,10,000.
    // Slab savings: 3.6L at 30% off (1,08,000) + 3.9L at 20% off (78,000)
    //             = 1,86,000 → with 4% cess = 1,93,440.
    expect(saved).toBeCloseTo(1_93_440, -1)
  })
})

// ── helpers ────────────────────────────────────────────────────────────────
function annualTDS(out: ReturnType<typeof indiaTaxEngine.compute>): number {
  const tds = out.deductions.find(d => d.code === 'tds')
  if (!tds) return 0
  return tds.amount * 12
}
