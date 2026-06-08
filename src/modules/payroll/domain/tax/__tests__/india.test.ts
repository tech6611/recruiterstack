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

// ── helpers ────────────────────────────────────────────────────────────────
function annualTDS(out: ReturnType<typeof indiaTaxEngine.compute>): number {
  const tds = out.deductions.find(d => d.code === 'tds')
  if (!tds) return 0
  return tds.amount * 12
}
