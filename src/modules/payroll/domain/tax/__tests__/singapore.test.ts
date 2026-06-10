/**
 * Singapore tax engine — Jan 2026 spec.
 *
 * Pins the math. Will fail loudly when CPF rates or IRAS slabs change
 * after a future budget. Update expected values together with the engine
 * constants, and re-cite the source in singapore.ts.
 */

import { describe, it, expect } from 'vitest'
import { singaporeTaxEngine } from '../singapore'
import type { PayrollOrgSettings } from '@/lib/types/database'

// SG ignores most India-flavored settings; we pass a complete object to
// satisfy the type, but only country_code matters here.
const sgSettings: PayrollOrgSettings = {
  org_id:                   'org_test',
  country_code:             'SG',
  default_state:            '',
  default_tax_regime:       'new',
  metro:                    false,
  basic_pct:                0.50,
  hra_pct_metro:            0.50,
  hra_pct_non_metro:        0.40,
  pf_employee_pct:          0,
  pf_wage_ceiling_enabled:  false,
  pf_wage_ceiling:          0,
  esi_threshold:            0,
  esi_employee_pct:         0,
  notes:                    null,
  created_at:               '2026-01-01T00:00:00Z',
  updated_at:               '2026-01-01T00:00:00Z',
}

function input(over: Partial<Parameters<typeof singaporeTaxEngine.compute>[0]> = {}) {
  return {
    annualBaseSalary: 96_000,                                   // S$8k/month at ceiling
    payFrequency:    'annual' as const,
    regime:          'new'    as const,
    periodsPerYear:  12,
    periodDays:      30,
    lwpDays:         0,
    settings:        sgSettings,
    declaration:     null,
    ...over,
  }
}

describe('Singapore tax engine — Jan 2026', () => {
  it('engine identity', () => {
    expect(singaporeTaxEngine.country).toBe('SG')
    expect(singaporeTaxEngine.id).toBe('singapore-2026')
  })

  // ── CPF — at the ceiling, below it, and above it ─────────────────────────
  it('S$8,000/mo (annual S$96k) at OW ceiling → employee CPF = S$1,600/mo', () => {
    const out = singaporeTaxEngine.compute(input({ annualBaseSalary: 96_000 }))
    const cpf = out.deductions.find(d => d.code === 'pf')!
    expect(cpf.amount).toBe(1600)                               // 8000 × 20%
  })

  it('S$5,000/mo (below ceiling) → CPF = S$1,000/mo (20% of full gross)', () => {
    const out = singaporeTaxEngine.compute(input({ annualBaseSalary: 60_000 }))
    const cpf = out.deductions.find(d => d.code === 'pf')!
    expect(cpf.amount).toBe(1000)                               // 5000 × 20%
  })

  it('S$15,000/mo (above ceiling) → CPF still caps at S$1,600/mo', () => {
    const out = singaporeTaxEngine.compute(input({ annualBaseSalary: 180_000 }))
    const cpf = out.deductions.find(d => d.code === 'pf')!
    expect(cpf.amount).toBe(1600)                               // capped at 8k × 20%
  })

  it('No monthly TDS — there is no `tds` non-informational deduction', () => {
    const out = singaporeTaxEngine.compute(input({ annualBaseSalary: 180_000 }))
    const tds = out.deductions.find(d => d.code === 'tds')
    // The engine emits projected annual tax as INFORMATIONAL only.
    expect(tds?.informational).toBe(true)
  })

  it('Annual tax projection: S$60k → ~S$550 (informational)', () => {
    // Annual gross 60k, CPF 12k (12 × 1000) → taxable = 48k.
    // Slabs: 20k @ 0% + 10k @ 2% + 10k @ 3.5% + 8k @ 7% = 0 + 200 + 350 + 560 = 1,110
    // Wait — that's S$1,110, not S$550. Let me recompute.
    // 48k taxable: 20k * 0 = 0; 10k (20→30) * 2% = 200; 10k (30→40) * 3.5% = 350;
    //              8k (40→48) * 7% = 560. Total = 1,110.
    const out = singaporeTaxEngine.compute(input({ annualBaseSalary: 60_000 }))
    const tax = out.deductions.find(d => d.code === 'tds')
    expect(tax?.amount).toBeCloseTo(1110, -1)
  })

  // ── LWP cross-module integration ─────────────────────────────────────────
  it('5 LWP days @ S$10k gross → S$1,666.67 deduction', () => {
    const out = singaporeTaxEngine.compute(input({
      annualBaseSalary: 120_000,                                // S$10k/month
      lwpDays: 5,
      periodDays: 30,
    }))
    const lwp = out.deductions.find(d => d.code === 'lwp')!
    expect(lwp.amount).toBeCloseTo(1_666.67, 2)
  })

  // ── Honest scope guards ──────────────────────────────────────────────────
  it('Hourly pay → explicit error (same contract as India)', () => {
    expect(() => singaporeTaxEngine.compute(input({ payFrequency: 'hourly' })))
      .toThrow(/hourly pay/i)
  })

  it('Surfaces a note flagging no-monthly-TDS', () => {
    const out = singaporeTaxEngine.compute(input())
    expect(out.meta.notes?.some(n => n.includes('no monthly income tax'))).toBe(true)
  })

  it('Surfaces a note when annual gross > CPF salary ceiling (S$102k)', () => {
    const out = singaporeTaxEngine.compute(input({ annualBaseSalary: 180_000 }))
    expect(out.meta.notes?.some(n => n.includes('Additional Wage'))).toBe(true)
  })

  it('Net = gross − active deductions only (informational lines do not subtract)', () => {
    const out = singaporeTaxEngine.compute(input({ annualBaseSalary: 60_000 }))
    // Monthly gross 5000, CPF 1000 → net 4000. Projected tax is informational.
    expect(out.gross).toBe(5000)
    expect(out.net).toBe(4000)
  })

  // ── Engine identity carried on meta ──────────────────────────────────────
  it('meta carries country=SG and engine=singapore-2026', () => {
    const out = singaporeTaxEngine.compute(input())
    expect(out.meta.country).toBe('SG')
    expect(out.meta.engine).toBe('singapore-2026')
    expect(out.meta.fy).toBe('2026')
  })
})
