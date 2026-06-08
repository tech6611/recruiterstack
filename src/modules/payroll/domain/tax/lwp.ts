/**
 * Leave-without-pay integrator — cross-module read from HRIS time_off.
 *
 * Counts approved unpaid leave days for an employee that overlap a payroll
 * period. Returns 0 if no overlapping approved unpaid leave exists. The
 * compute orchestrator passes the result into the tax engine, which decides
 * how to apply it (proportional reduction of net by default).
 *
 * Why this lives in the payroll module (not HRIS): the rule "LWP reduces
 * payroll" is a payroll concern. HRIS just records that someone took
 * unpaid leave; payroll decides what to do with it. Reading from another
 * module's table is allowed because everything sits on the same canonical DB.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'

type Supabase = SupabaseClient<Database>

/** Inclusive calendar-day count between two YYYY-MM-DD strings. */
function daysInclusive(start: string, end: string): number {
  const s = new Date(start + 'T00:00:00Z')
  const e = new Date(end   + 'T00:00:00Z')
  if (isNaN(s.getTime()) || isNaN(e.getTime())) return 0
  const diff = Math.round((e.getTime() - s.getTime()) / 86_400_000)
  return Math.max(0, diff + 1)
}

/** Days overlap between two inclusive date ranges (YYYY-MM-DD). */
function overlapDays(aStart: string, aEnd: string, bStart: string, bEnd: string): number {
  const start = aStart > bStart ? aStart : bStart
  const end   = aEnd   < bEnd   ? aEnd   : bEnd
  if (start > end) return 0
  return daysInclusive(start, end)
}

export async function lwpDaysForPeriod(
  supabase:   Supabase,
  orgId:      string,
  employeeId: string,
  periodStart: string,                                          // YYYY-MM-DD
  periodEnd:   string,                                          // YYYY-MM-DD
): Promise<number> {
  // Pull approved unpaid leave that *could* overlap the period.
  const { data, error } = await supabase
    .from('time_off_requests')
    .select('start_date, end_date, request_type, status')
    .eq('org_id', orgId)
    .eq('employee_id', employeeId)
    .eq('status', 'approved')
    .eq('request_type', 'unpaid')
    .lte('start_date', periodEnd)
    .gte('end_date',   periodStart)
  if (error) throw error

  let total = 0
  for (const r of (data ?? []) as Array<{ start_date: string; end_date: string }>) {
    total += overlapDays(r.start_date, r.end_date, periodStart, periodEnd)
  }
  return total
}
