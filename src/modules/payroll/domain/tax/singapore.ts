/**
 * Singapore tax engine — effective 1 Jan 2026.
 *
 * Structurally simpler than India: Singapore doesn't withhold monthly
 * income tax (no TDS) — employees file annually with IRAS. So the only
 * mandatory monthly payroll deduction is CPF. We do show a projected
 * annual income tax as an *informational* line so the employee sees a
 * full picture of their year-end exposure; it doesn't reduce net.
 *
 * Sources (verified June 2026):
 *   - CPF rates from 1 Jan 2026 (CPFB Table 1): employee ≤55 → 20%,
 *     employer 17%; OW ceiling S$8,000/month; annual ceiling S$102,000.
 *   - IRAS YA2024+ progressive resident slabs (stable through YA2026):
 *     0% on first S$20k, top rate 24% above S$1M.
 *
 * Honest scope — NOT in this engine:
 *   - Age tiers above 55 (rates step down for older workers). Most SG
 *     SaaS staff are <55; we'll add the older tiers when a customer asks.
 *   - SDL (Skills Development Levy) — employer 0.25%, capped at S$11.25.
 *     Informational only in v1 (not deducted from net).
 *   - Additional Wages (bonus / 13th month) — these get their own CPF
 *     calculation against an annual ceiling; v1 treats annual_base_salary
 *     as monthly × 12 with no AW.
 *   - Non-resident rates (15% flat OR resident rates whichever is higher
 *     for short-stay employees). v1 assumes resident status.
 *   - Personal reliefs (Earned Income Relief, NSman, CPF cash top-up,
 *     SRS, etc.). We just project annual tax from gross.
 */

import type { TaxComputeInput, TaxComputeOutput, TaxEngine, TaxLine } from './types'

const YA = '2026'                                                // year of assessment for the slabs below

// ── CPF (Jan 2026+ rates) ────────────────────────────────────────────────────
// Employees aged ≤55. OW = Ordinary Wages (monthly).
const CPF_EMPLOYEE_PCT     = 0.20                                // 20%
const CPF_EMPLOYER_PCT     = 0.17                                // 17%
const CPF_OW_CEILING_MONTH = 8000                                // S$8,000/month from 1 Jan 2026
const CPF_ANNUAL_CEILING   = 102_000                             // total wages subject to CPF/year

// ── IRAS resident slabs (YA2024 onwards; stable through YA2026) ─────────────
// Cumulative format: each row is the upper bound of the band and its marginal
// rate. The applySlabs() helper sweeps from the bottom up.
type Slab = { upTo: number; rate: number }
const SG_RESIDENT_SLABS: Slab[] = [
  { upTo:    20_000, rate: 0.00  },
  { upTo:    30_000, rate: 0.02  },
  { upTo:    40_000, rate: 0.035 },
  { upTo:    80_000, rate: 0.07  },
  { upTo:   120_000, rate: 0.115 },
  { upTo:   160_000, rate: 0.15  },
  { upTo:   200_000, rate: 0.18  },
  { upTo:   240_000, rate: 0.19  },
  { upTo:   280_000, rate: 0.195 },
  { upTo:   320_000, rate: 0.20  },
  { upTo:   500_000, rate: 0.22  },
  { upTo: 1_000_000, rate: 0.23  },
  { upTo: Infinity,  rate: 0.24  },
]

function applySlabs(income: number, slabs: Slab[]): number {
  if (income <= 0) return 0
  let remaining = income, last = 0, tax = 0
  for (const s of slabs) {
    const band = s.upTo - last
    const taxable = Math.min(remaining, band)
    tax += taxable * s.rate
    remaining -= taxable
    last = s.upTo
    if (remaining <= 0) break
  }
  return tax
}

// ── Engine ───────────────────────────────────────────────────────────────────

export const singaporeTaxEngine: TaxEngine = {
  id:      'singapore-2026',
  country: 'SG',
  label:   'Singapore — Jan 2026',
  fy:      YA,

  compute(input: TaxComputeInput): TaxComputeOutput {
    if (input.payFrequency === 'hourly') {
      throw new Error('Singapore engine does not support hourly pay yet; convert to monthly/annual.')
    }
    const periodsPerYear = input.periodsPerYear || 12
    const annualGross =
      input.payFrequency === 'annual'  ? input.annualBaseSalary :
      input.payFrequency === 'monthly' ? input.annualBaseSalary * 12 :
      0
    const periodGross = annualGross / periodsPerYear

    // ── Earnings: just gross (no Basic/HRA split in SG payroll) ──────────
    const earnings: TaxLine[] = [
      { code: 'basic', label: 'Gross pay', amount: round(periodGross) },
    ]

    // ── CPF: 20% of min(monthly gross, OW ceiling) ───────────────────────
    const cpfWageBase = Math.min(periodGross, CPF_OW_CEILING_MONTH)
    const cpfAmount   = cpfWageBase * CPF_EMPLOYEE_PCT
    // Employer side is informational only (doesn't reduce net).
    const employerCpf = cpfWageBase * CPF_EMPLOYER_PCT

    // ── LWP (cross-module from HRIS) ─────────────────────────────────────
    const lwpAmount = input.lwpDays > 0 && input.periodDays > 0
      ? Math.min(periodGross, (periodGross / input.periodDays) * input.lwpDays)
      : 0

    // ── Annual income tax projection (informational; not deducted) ───────
    // CPF reduces taxable income (it's a deductible "earned income" item).
    // We don't model personal reliefs in v1; the projection is an *estimate*.
    const annualCpf = cpfAmount * periodsPerYear
    const taxableAnnual = Math.max(0, annualGross - annualCpf)
    const annualTaxEst  = applySlabs(taxableAnnual, SG_RESIDENT_SLABS)

    // ── Assemble deduction lines ─────────────────────────────────────────
    const deductions: TaxLine[] = []
    if (cpfAmount > 0) deductions.push({
      code: 'pf', label: `CPF (${(CPF_EMPLOYEE_PCT * 100).toFixed(0)}%)`,
      amount: round(cpfAmount),
      note:   periodGross > CPF_OW_CEILING_MONTH
        ? `Capped at OW ceiling S$${CPF_OW_CEILING_MONTH.toLocaleString('en-SG')}/mo.`
        : '20% of monthly gross.',
    })
    if (lwpAmount > 0) deductions.push({
      code: 'lwp', label: `LWP (${input.lwpDays} day${input.lwpDays === 1 ? '' : 's'})`,
      amount: round(lwpAmount),
      note:   `Unpaid leave: ${input.lwpDays} day${input.lwpDays === 1 ? '' : 's'} × S$${round(periodGross / input.periodDays).toLocaleString('en-SG')}/day.`,
    })

    // Informational: employer CPF (no deduction from employee net).
    if (employerCpf > 0) deductions.push({
      code: 'employer_pf', label: 'Employer CPF (informational)',
      amount: round(employerCpf),
      informational: true,
      note: '17% matched by employer; does NOT reduce your take-home.',
    })

    // Informational: projected annual income tax. Employees file with IRAS
    // annually — there's no monthly withholding in Singapore.
    if (annualTaxEst > 0) deductions.push({
      code: 'tds', label: 'Projected annual income tax (estimate)',
      amount: round(annualTaxEst),
      informational: true,
      note: `Singapore has no monthly tax withholding. Estimate based on annual gross less CPF, before personal reliefs (Earned Income, NSman, etc.). File with IRAS by 18 April.`,
    })

    const gross           = sumActive(earnings)
    const deductionsTotal = sumActive(deductions)
    const net             = Math.max(0, gross - deductionsTotal)

    const notes: string[] = []
    notes.push('Singapore has no monthly income tax (TDS); employees file annually with IRAS.')
    if (annualGross > CPF_ANNUAL_CEILING) {
      notes.push(`Annual gross exceeds the S$${CPF_ANNUAL_CEILING.toLocaleString('en-SG')} CPF salary ceiling; bonus/13th-month wages may need separate Additional Wage CPF calculation.`)
    }
    if (input.payFrequency !== 'monthly') {
      notes.push(`Pay frequency is "${input.payFrequency}"; CPF/tax projection uses ${periodsPerYear} periods/year.`)
    }

    return {
      earnings,
      deductions,
      gross:           round(gross),
      deductionsTotal: round(deductionsTotal),
      net:             round(net),
      meta: {
        engine:  this.id,
        country: 'SG',
        regime:  'new',                                          // SG has no regime split; pick a stable value
        fy:      YA,
        metro:   false,                                          // not applicable in SG; honest default
        state:   '',                                             // no state-level tax in SG
        notes:   notes.length > 0 ? notes : undefined,
      },
    }
  },
}

function round(n: number): number { return Math.round(n * 100) / 100 }
function sumActive(lines: TaxLine[]): number {
  return lines.reduce((acc, l) => acc + (l.informational ? 0 : l.amount), 0)
}
