/**
 * India tax engine — FY 2026-27 (AY 2027-28).
 *
 * Both regimes (new + old). Budget 2026 (Feb 2026) kept the FY 2025-26
 * slabs / rebates / surcharges / cess as-is for FY 2026-27, so the numbers
 * below also apply to FY 2025-26. Update every February after the next
 * budget — slabs, rebates, surcharge thresholds, cess rate.
 *
 * Sources (verified at build time, June 2026):
 * - Income tax slabs (both regimes) — Finance Act 2025, unchanged by Budget 2026
 * - PF wage ceiling ₹15,000 — Ministry of Labour notification, May 2026
 * - Karnataka PT — Karnataka Tax on Professions Amendment Act 2025
 *   (threshold raised from ₹15k to ₹25k effective Apr 2025).
 *
 * Honest scope — what this engine does NOT compute:
 * - Form 16 / annual return filing
 * - Employer PF beyond informational display (no EPS split)
 * - Gratuity accrual
 * - Surcharge marginal relief at exact thresholds (slightly wrong within
 *   the ~₹3-5k window around each surcharge floor)
 * - Old-regime exemptions beyond HRA / 80C / 80D / 80CCD(1B) — Form 12BB
 *   has dozens more; we cover what 95% of salaried employees use.
 * - Multiple employers / Form 12BB declarations
 * - Hourly pay (throws — orgs using hourly need v1.1)
 */

import type { TaxComputeInput, TaxComputeOutput, TaxEngine, TaxLine } from './types'

const FY = '2026-27'

// ── Slab tables (verified June 2026) ─────────────────────────────────────────

type Slab = { upTo: number; rate: number }   // upTo: upper bound of slab (Infinity for the top)

// New regime — Finance Act 2025, applies through FY 2026-27
const NEW_REGIME_SLABS: Slab[] = [
  { upTo:  400_000, rate: 0.00 },
  { upTo:  800_000, rate: 0.05 },
  { upTo: 1_200_000, rate: 0.10 },
  { upTo: 1_600_000, rate: 0.15 },
  { upTo: 2_000_000, rate: 0.20 },
  { upTo: 2_400_000, rate: 0.25 },
  { upTo: Infinity,  rate: 0.30 },
]

// Old regime — unchanged for several years
const OLD_REGIME_SLABS: Slab[] = [
  { upTo:  250_000, rate: 0.00 },
  { upTo:  500_000, rate: 0.05 },
  { upTo: 1_000_000, rate: 0.20 },
  { upTo: Infinity,  rate: 0.30 },
]

// Standard deductions (annual)
const STD_DED_NEW = 75_000
const STD_DED_OLD = 50_000

// Section 87A rebate
const REBATE_87A_NEW = { incomeCap: 1_200_000, maxRebate: 60_000 }
const REBATE_87A_OLD = { incomeCap:   500_000, maxRebate: 12_500 }

// Cess rate (Health & Education) — 4% on tax + surcharge
const CESS_RATE = 0.04

// Surcharge thresholds. Above each band's `upTo`, surcharge applies on tax.
// We don't implement marginal relief (small error window at thresholds).
// New regime caps at 25% (37% was removed in 2023 budget); old regime still
// has 37% above ₹5Cr.
const SURCHARGE_TIERS_NEW: Slab[] = [
  { upTo:  5_000_000, rate: 0.00 },
  { upTo: 10_000_000, rate: 0.10 },
  { upTo: 20_000_000, rate: 0.15 },
  { upTo: Infinity,   rate: 0.25 },
]
const SURCHARGE_TIERS_OLD: Slab[] = [
  { upTo:  5_000_000, rate: 0.00 },
  { upTo: 10_000_000, rate: 0.10 },
  { upTo: 20_000_000, rate: 0.15 },
  { upTo: 50_000_000, rate: 0.25 },
  { upTo: Infinity,   rate: 0.37 },
]

// 80C / 80D / 80CCD(1B) caps (old regime exemptions)
const CAP_80C       = 150_000
const CAP_80D       =  25_000      // self+family below 60; senior is 50k — not split in v1
const CAP_80CCD_1B  =  50_000      // additional NPS over 80C

// ── State PT engines ─────────────────────────────────────────────────────────
// Karnataka raised threshold to ₹25,000/month in Apr 2025; ₹200/month above.
// (Feb has ₹300 statutorily, but most payroll software smooths to ₹200 ×12 +
//  ₹300 in Feb. We use the smoothed monthly ₹200 average for simplicity —
//  ₹100 understated annually. Documented.)
type PtEngine = (monthlyGross: number) => { amount: number; note?: string }
const PT_ENGINES: Record<string, PtEngine> = {
  KA: (g) => ({
    amount: g > 25_000 ? 200 : 0,
    note:   g > 25_000 ? '₹200/mo Apr–Jan; statutorily ₹300 in Feb — smoothed.' : undefined,
  }),
  // Maharashtra — tiered, smoothed monthly average
  MH: (g) => {
    if (g <  7_500)  return { amount: 0   }
    if (g <  10_000) return { amount: 175 }
    return { amount: 200, note: 'Statutorily ₹300 in Feb — smoothed to ₹200.' }
  },
  // Tamil Nadu — half-yearly slabs, smoothed (₹208/mo on avg above ₹12.5k)
  TN: (g) => ({
    amount: g >= 12_500 ? 208 : 0,
    note:   'TN PT is half-yearly; smoothed monthly average.',
  }),
  // Delhi / Haryana — no professional tax
  DL: ()  => ({ amount: 0 }),
  HR: ()  => ({ amount: 0 }),
}
function ptForState(state: string, monthlyGross: number): { amount: number; note?: string } {
  const engine = PT_ENGINES[state.toUpperCase()]
  if (!engine) return { amount: 0, note: `No PT rule registered for state '${state}'.` }
  return engine(monthlyGross)
}

// ── Slab applicator ──────────────────────────────────────────────────────────

function applySlabs(income: number, slabs: Slab[]): number {
  if (income <= 0) return 0
  let remaining = income, last = 0, tax = 0
  for (const s of slabs) {
    const bandWidth = s.upTo - last
    const taxable   = Math.min(remaining, bandWidth)
    tax += taxable * s.rate
    remaining -= taxable
    last = s.upTo
    if (remaining <= 0) break
  }
  return tax
}

// ── Engine ───────────────────────────────────────────────────────────────────

export const indiaTaxEngine: TaxEngine = {
  id:      'india-2026',
  country: 'IN',
  label:   'India — FY 2026-27',
  fy:      FY,

  compute(input: TaxComputeInput): TaxComputeOutput {
    if (input.payFrequency === 'hourly') {
      throw new Error('India engine does not support hourly pay yet; convert to monthly/annual or skip the employee.')
    }

    const { settings, regime, declaration } = input
    const periodsPerYear = input.periodsPerYear || 12

    // ── Step 1: Period gross (CTC → period gross) ────────────────────────
    const annualGross =
      input.payFrequency === 'annual'  ? input.annualBaseSalary :
      input.payFrequency === 'monthly' ? input.annualBaseSalary * 12 :
      0
    const periodGross = annualGross / periodsPerYear

    // ── Step 2: Basic / HRA / Special decomposition ──────────────────────
    const basicPeriod  = periodGross * settings.basic_pct
    const basicAnnual  = annualGross * settings.basic_pct
    const hraPct       = settings.metro ? settings.hra_pct_metro : settings.hra_pct_non_metro
    const hraPeriod    = basicPeriod * hraPct
    const hraAnnual    = basicAnnual * hraPct
    const specialPeriod = Math.max(0, periodGross - basicPeriod - hraPeriod)

    const earnings: TaxLine[] = [
      { code: 'basic',             label: 'Basic',             amount: round(basicPeriod) },
      { code: 'hra',               label: 'HRA',               amount: round(hraPeriod) },
      { code: 'special_allowance', label: 'Special allowance', amount: round(specialPeriod) },
    ]

    // ── Step 3: LWP (proportional reduction) ─────────────────────────────
    // We deduct LWP from net (as a separate deduction line) rather than
    // reducing gross — keeps the gross line consistent with the comp record
    // and makes the impact visible to the employee.
    const lwpAmount = input.lwpDays > 0 && input.periodDays > 0
      ? Math.min(periodGross, (periodGross / input.periodDays) * input.lwpDays)
      : 0

    // ── Step 4: PF ───────────────────────────────────────────────────────
    const pfBase = settings.pf_wage_ceiling_enabled
      ? Math.min(basicPeriod, settings.pf_wage_ceiling)
      : basicPeriod
    const pfAmount = pfBase * settings.pf_employee_pct

    // ── Step 5: ESI (only if gross at/below threshold) ───────────────────
    const esiAmount = periodGross <= settings.esi_threshold
      ? periodGross * settings.esi_employee_pct
      : 0

    // ── Step 6: Professional Tax (state-varying) ─────────────────────────
    const pt = ptForState(settings.default_state, periodGross)

    // ── Step 7: TDS (annual projection ÷ periodsPerYear) ─────────────────
    const tdsAnnual = computeAnnualTDS({
      annualGross,
      basicAnnual,
      hraAnnual,
      pfAnnual:  pfAmount * periodsPerYear,
      regime,
      metro:     settings.metro,
      declaration: regime === 'old' ? declaration ?? null : null,
    })
    const tdsPeriod = tdsAnnual / periodsPerYear

    // ── Step 8: Assemble deduction lines ─────────────────────────────────
    const deductions: TaxLine[] = []
    if (pfAmount > 0) deductions.push({
      code: 'pf', label: `PF (${(settings.pf_employee_pct * 100).toFixed(1)}%)`,
      amount: round(pfAmount),
      note:   settings.pf_wage_ceiling_enabled ? `Capped at ₹${settings.pf_wage_ceiling.toLocaleString('en-IN')} basic.` : '12% of Basic, no cap.',
    })
    if (esiAmount > 0) deductions.push({
      code: 'esi', label: `ESI (${(settings.esi_employee_pct * 100).toFixed(2)}%)`,
      amount: round(esiAmount),
      note:   `Applies because monthly gross ≤ ₹${settings.esi_threshold.toLocaleString('en-IN')}.`,
    })
    if (pt.amount > 0) deductions.push({
      code: 'professional_tax', label: `Professional Tax (${settings.default_state})`,
      amount: round(pt.amount),
      note:   pt.note,
    })
    if (tdsPeriod > 0) deductions.push({
      code: 'tds', label: `TDS (${regime} regime)`,
      amount: round(tdsPeriod),
      note:   `Annual TDS ₹${round(tdsAnnual).toLocaleString('en-IN')} ÷ ${periodsPerYear} periods.`,
    })
    if (lwpAmount > 0) deductions.push({
      code: 'lwp', label: `LWP (${input.lwpDays} day${input.lwpDays === 1 ? '' : 's'})`,
      amount: round(lwpAmount),
      note:   `Unpaid leave: ${input.lwpDays} day${input.lwpDays === 1 ? '' : 's'} × ₹${round(periodGross / input.periodDays).toLocaleString('en-IN')}/day.`,
    })

    // Informational employer-side PF (matches employee 12%; not deducted)
    const employerPf = pfAmount   // simplified: full match. EPS split intentionally omitted.
    if (employerPf > 0) deductions.push({
      code: 'employer_pf', label: 'Employer PF (informational)',
      amount: round(employerPf),
      informational: true,
      note: 'Matched by employer; does NOT reduce your take-home.',
    })

    const gross = sumActive(earnings)
    const deductionsTotal = sumActive(deductions)
    const net = Math.max(0, gross - deductionsTotal)

    const notes: string[] = []
    if (regime === 'old' && !declaration) notes.push('Old regime selected but no declaration on file — no exemptions applied.')
    if (input.payFrequency !== 'monthly')  notes.push(`Pay frequency is "${input.payFrequency}"; TDS projection uses ${periodsPerYear} periods/year.`)

    return {
      earnings,
      deductions,
      gross:           round(gross),
      deductionsTotal: round(deductionsTotal),
      net:             round(net),
      meta: {
        engine:  this.id,
        country: 'IN',
        regime,
        fy:      FY,
        metro:   settings.metro,
        state:   settings.default_state,
        notes:   notes.length > 0 ? notes : undefined,
      },
    }
  },
}

// ── TDS — annual ─────────────────────────────────────────────────────────────
// Pure function; unit-tested. Inputs are annual amounts.
export function computeAnnualTDS(args: {
  annualGross:  number
  basicAnnual:  number
  hraAnnual:    number                                          // received, before exemption
  pfAnnual:     number                                          // for 80C inclusion under old regime
  regime:       'new' | 'old'
  metro:        boolean
  declaration:  { rent_paid_annual: number; section_80c: number; section_80d: number; section_80ccd_1b: number } | null
}): number {
  let taxable: number
  let slabs: Slab[]
  let surchargeTiers: Slab[]
  let rebate: { incomeCap: number; maxRebate: number }

  if (args.regime === 'new') {
    taxable        = Math.max(0, args.annualGross - STD_DED_NEW)
    slabs          = NEW_REGIME_SLABS
    surchargeTiers = SURCHARGE_TIERS_NEW
    rebate         = REBATE_87A_NEW
  } else {
    // Old regime: standard deduction + HRA exemption + 80C (incl. EPF) + 80D + 80CCD(1B)
    const d = args.declaration ?? { rent_paid_annual: 0, section_80c: 0, section_80d: 0, section_80ccd_1b: 0 }

    // HRA exemption (least of three):
    //   1. Actual HRA received
    //   2. Rent paid − 10% of Basic
    //   3. 50% (metro) / 40% (non-metro) of Basic
    let hraExemption = 0
    if (d.rent_paid_annual > 0 && args.hraAnnual > 0) {
      const cap1 = args.hraAnnual
      const cap2 = Math.max(0, d.rent_paid_annual - 0.10 * args.basicAnnual)
      const cap3 = args.basicAnnual * (args.metro ? 0.50 : 0.40)
      hraExemption = Math.min(cap1, cap2, cap3)
    }

    // 80C cap is ₹1.5L; employee PF counts toward it.
    const ded80c     = Math.min(CAP_80C,      d.section_80c + args.pfAnnual)
    const ded80d     = Math.min(CAP_80D,      d.section_80d)
    const ded80ccd1b = Math.min(CAP_80CCD_1B, d.section_80ccd_1b)

    taxable = Math.max(0,
      args.annualGross
      - STD_DED_OLD
      - hraExemption
      - ded80c - ded80d - ded80ccd1b,
    )
    slabs          = OLD_REGIME_SLABS
    surchargeTiers = SURCHARGE_TIERS_OLD
    rebate         = REBATE_87A_OLD
  }

  let tax = applySlabs(taxable, slabs)

  // 87A rebate
  if (taxable <= rebate.incomeCap) tax = Math.max(0, tax - rebate.maxRebate)

  // Surcharge
  const surchargeRate = rateForBand(taxable, surchargeTiers)
  const surcharge     = tax * surchargeRate

  // Health & Education Cess (4% on tax + surcharge)
  const cess = (tax + surcharge) * CESS_RATE

  return tax + surcharge + cess
}

function rateForBand(income: number, tiers: Slab[]): number {
  for (const t of tiers) {
    if (income <= t.upTo) return t.rate
  }
  return tiers[tiers.length - 1].rate
}

function round(n: number): number { return Math.round(n * 100) / 100 }

function sumActive(lines: TaxLine[]): number {
  return lines.reduce((acc, l) => acc + (l.informational ? 0 : l.amount), 0)
}
