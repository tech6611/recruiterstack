/**
 * Tax-engine registry — lookup by country code.
 *
 * v1 has exactly one entry (India). Future country engines register here.
 * Callers (compute orchestrator, settings UI, agent prompt) ask the registry
 * by country code; nothing imports engines directly.
 */

import type { CountryCode } from '@/lib/types/database'
import type { TaxEngine } from './types'
import { indiaTaxEngine } from './india'

const REGISTRY: Record<CountryCode, TaxEngine> = {
  IN: indiaTaxEngine,
}

export function getTaxEngine(country: CountryCode): TaxEngine {
  const e = REGISTRY[country]
  if (!e) throw new Error(`No tax engine registered for country '${country}'.`)
  return e
}

/** All registered engines (settings UI uses this to populate the country picker). */
export function listTaxEngines(): TaxEngine[] {
  return Object.values(REGISTRY)
}

// ── Financial-year helper ────────────────────────────────────────────────────
// Indian FY runs Apr→Mar; '2026-27' means Apr 2026 → Mar 2027. Other countries
// will need their own FY logic, but we centralise India's here for now.

export function fyFromDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date + (date.length === 10 ? 'T00:00:00Z' : '')) : date
  const y = d.getUTCFullYear()
  const m = d.getUTCMonth()                                     // 0=Jan
  // Apr (3) and later → FY starts this year; Jan-Mar → FY started last year
  const startYear = m >= 3 ? y : y - 1
  const endYY     = ((startYear + 1) % 100).toString().padStart(2, '0')
  return `${startYear}-${endYY}`
}
