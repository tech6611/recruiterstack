/**
 * Pluggable tax-engine interface.
 *
 * v1 ships exactly one engine — India, FY 2026-27 (see ./india.ts). The
 * interface is here so that:
 *   (a) the rest of the payroll module (compute orchestrator, agent tools,
 *       UI) never imports an engine directly — it asks the registry by
 *       country code,
 *   (b) the day we hand-code another country (US? UK?) or integrate a real
 *       engine (Symmetry, Razorpay), we drop a new file into this folder
 *       implementing TaxEngine and register it. No schema rewrite, no
 *       caller change.
 *
 * Engines are *pure functions* of their inputs — no DB calls inside. The
 * orchestrator loads everything (comp record, settings, declarations, LWP
 * lines) and hands it in. Makes them trivially unit-testable.
 */

import type { CountryCode, PayrollOrgSettings, TaxRegime } from '@/lib/types/database'

// ── Engine I/O ───────────────────────────────────────────────────────────────

/**
 * One line item on a payslip's earnings or deductions side. The engine emits
 * lines; the run aggregator sums them into gross / deductions_total / net.
 */
export interface TaxLine {
  /** Short user-facing label ("Basic", "HRA", "PF (12%)", "TDS"). */
  label:  string
  amount: number
  /** Stable engine code so the UI can colour / group / link consistently. */
  code:
    | 'basic' | 'hra' | 'special_allowance'                     // earnings
    | 'pf' | 'esi' | 'professional_tax' | 'tds' | 'lwp'         // deductions
    | 'employer_pf' | 'employer_esi'                            // informational
    | 'other'
  /** True = informational only, do NOT sum into gross/deductions. */
  informational?: boolean
  /** Free-form note shown in tooltip / detail view (e.g. exemption math). */
  note?: string
}

export interface TaxComputeInput {
  /** Annual base salary in INR (or run currency once non-INR engines land). */
  annualBaseSalary: number
  /** 'annual' | 'monthly' | 'hourly' — engines that can't handle a frequency
   *  must throw an explicit Error so the orchestrator can surface it. */
  payFrequency: 'annual' | 'monthly' | 'hourly'
  /** This payslip's regime — engine respects per-employee override over org default. */
  regime: TaxRegime
  /** Number of pay periods covered in the FY for TDS projection. Monthly = 12. */
  periodsPerYear: number
  /** Period length in days; used by LWP / proration. Monthly ≈ 30. */
  periodDays: number
  /** LWP days within the period (already filtered to status='approved'
   *  and type='unpaid' overlapping the period). Engine deducts this. */
  lwpDays: number
  /** Org-level engine config. */
  settings: PayrollOrgSettings
  /** Old-regime only; engine ignores under 'new'.
   *  `other_exemptions` carries country-engine-specific extras as an open
   *  jsonb-shaped record. India v1.1 reads keys: '24b', '80e', '80g',
   *  '80tta'. Unknown keys are ignored — adding new sections later is
   *  additive in the engine, no type change here. */
  declaration?: {
    rent_paid_annual:  number
    section_80c:       number
    section_80d:       number
    section_80ccd_1b:  number
    other_exemptions?: Record<string, number>
  } | null
}

export interface TaxComputeOutput {
  /** All earning lines (Basic + HRA + Special + …). */
  earnings:   TaxLine[]
  /** All deduction lines (PF, ESI, PT, TDS, LWP, …). */
  deductions: TaxLine[]
  /** Sum of earnings.amount (excluding informational). */
  gross:      number
  /** Sum of deductions.amount (excluding informational). */
  deductionsTotal: number
  /** gross - deductionsTotal, clamped at 0. */
  net:        number
  /** Engine-attributed metadata: regime applied, FY used, slabs version, etc.
   *  Stored on the payslip's breakdown jsonb for traceability. */
  meta:       {
    engine:           string                                    // 'india-2026'
    country:          CountryCode
    regime:           TaxRegime
    fy:               string                                    // '2026-27'
    metro:            boolean
    state:            string
    notes?:           string[]
  }
}

// ── Engine interface ─────────────────────────────────────────────────────────

export interface TaxEngine {
  /** Stable ID, e.g. 'india-2026'. Stored on the payslip for traceability. */
  readonly id:      string
  readonly country: CountryCode
  /** Display name for settings UI. */
  readonly label:   string
  /** Financial year this engine's numbers are valid for. */
  readonly fy:      string
  compute(input: TaxComputeInput): TaxComputeOutput
}
