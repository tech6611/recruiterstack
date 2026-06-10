/**
 * Cross-module people analytics.
 *
 * Lives in `core` because every metric below joins data that crosses module
 * boundaries (ATS applications → HRIS employee_profiles → Payroll payslips).
 * Module-internal domains can't do this without violating the boundary rule,
 * so the canonical analytics layer owns the joins.
 *
 * Each function is independently invoked, isolated by org_id, and returns a
 * shape the UI can render without further joining. Errors from one metric
 * don't sink the others — the route catches per-call.
 *
 * What this is NOT:
 *   - A general-purpose query builder.
 *   - A caching layer (queries are scoped + indexed; sub-100ms in practice).
 *   - A time-series engine (no rollups, no warehouse). v1 returns scalars +
 *     small lists; charts are computed in the UI.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'

type Supabase = SupabaseClient<Database>

// ── Time window helper ──────────────────────────────────────────────────────
// All metrics use a rolling window measured in days from "now". Defaults to 90
// days to match a hiring quarter; callers can override per request.
function windowStart(days: number): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - days)
  return d.toISOString()
}

// ── 1. Conversion funnel ────────────────────────────────────────────────────
// Apps → hired → joined → still-active. Each step counts the *applications*
// (not the people), so the funnel reads as a clean cascade. The transitions
// are derived from canonical timestamps, not status alone — an application
// that was hired+then-withdrew still counts at the "hired" step.

export interface ConversionFunnel {
  window_days:   number
  apps_total:    number
  apps_hired:    number                         // applications whose status reached 'hired'
  apps_joined:   number                         // ...and produced an employee_profile that's joined or active
  apps_active:   number                         // ...and the employee_profile is currently active
  /** Convenience ratios (0..1) for the UI; nulls when denominator = 0. */
  hire_rate:     number | null                  // apps_hired   / apps_total
  join_rate:     number | null                  // apps_joined  / apps_hired
  active_rate:   number | null                  // apps_active  / apps_joined
}

export async function getConversionFunnel(
  supabase: Supabase,
  orgId:    string,
  days:     number = 90,
): Promise<ConversionFunnel> {
  const since = windowStart(days)

  // Total applications created in the window
  const totalRes = await supabase
    .from('applications')
    .select('id', { count: 'exact', head: true })
    .eq('org_id', orgId)
    .gte('applied_at', since)
  if (totalRes.error) throw totalRes.error
  const apps_total = totalRes.count ?? 0

  // Hired applications — `status='hired'` is the cleanest signal; the trigger
  // that creates an employee_profile fires on this flip (migration 047).
  const hiredRes = await supabase
    .from('applications')
    .select('id', { count: 'exact', head: true })
    .eq('org_id', orgId)
    .eq('status', 'hired')
    .gte('applied_at', since)
  if (hiredRes.error) throw hiredRes.error
  const apps_hired = hiredRes.count ?? 0

  // For joined/active we need employee_profiles linked back to applications in
  // the window. application_id is nullable (pre-canonical hires don't carry
  // one) but for in-window apps the trigger always sets it.
  const empRes = await supabase
    .from('employee_profiles')
    .select('application_id, status, joined_at')
    .eq('org_id', orgId)
    .not('application_id', 'is', null)
  if (empRes.error) throw empRes.error
  const profiles = (empRes.data ?? []) as Array<{ application_id: string | null; status: string; joined_at: string | null }>

  // Filter to profiles whose source application is in our window.
  // Two-step: pull the in-window app IDs, then intersect.
  const winAppRes = await supabase
    .from('applications')
    .select('id')
    .eq('org_id', orgId)
    .gte('applied_at', since)
  if (winAppRes.error) throw winAppRes.error
  const winAppIds = new Set(((winAppRes.data ?? []) as Array<{ id: string }>).map(r => r.id))

  let apps_joined = 0, apps_active = 0
  for (const p of profiles) {
    if (!p.application_id || !winAppIds.has(p.application_id)) continue
    if (p.joined_at && (p.status === 'active' || p.status === 'terminated')) apps_joined += 1
    if (p.status === 'active') apps_active += 1
  }

  return {
    window_days:   days,
    apps_total,
    apps_hired,
    apps_joined,
    apps_active,
    hire_rate:    apps_total  > 0 ? apps_hired  / apps_total  : null,
    join_rate:    apps_hired  > 0 ? apps_joined / apps_hired  : null,
    active_rate:  apps_joined > 0 ? apps_active / apps_joined : null,
  }
}

// ── 2. Time-to-hire ─────────────────────────────────────────────────────────
// Days from applied_at to the employee_profile.hired_at (which the trigger
// stamps the moment status flips to 'hired'). Median + interquartile range
// is more useful than mean — hiring distributions are right-skewed (a few
// drawn-out searches pull the average up).

export interface TimeToHire {
  window_days: number
  sample_size: number
  median_days: number | null
  p25_days:    number | null
  p75_days:    number | null
  min_days:    number | null
  max_days:    number | null
}

export async function getTimeToHire(
  supabase: Supabase,
  orgId:    string,
  days:     number = 90,
): Promise<TimeToHire> {
  const since = windowStart(days)

  // employee_profiles.hired_at + applications.applied_at
  const empRes = await supabase
    .from('employee_profiles')
    .select('application_id, hired_at')
    .eq('org_id', orgId)
    .not('application_id', 'is', null)
    .not('hired_at',       'is', null)
    .gte('hired_at',       since)
  if (empRes.error) throw empRes.error
  const profiles = (empRes.data ?? []) as Array<{ application_id: string; hired_at: string }>
  if (profiles.length === 0) {
    return { window_days: days, sample_size: 0, median_days: null, p25_days: null, p75_days: null, min_days: null, max_days: null }
  }

  // Fetch matching applications in one round-trip.
  const appIds = profiles.map(p => p.application_id)
  const appsRes = await supabase
    .from('applications')
    .select('id, applied_at')
    .eq('org_id', orgId)
    .in('id', appIds)
  if (appsRes.error) throw appsRes.error
  const appliedAtById = new Map(((appsRes.data ?? []) as Array<{ id: string; applied_at: string }>).map(a => [a.id, a.applied_at]))

  const durations: number[] = []
  for (const p of profiles) {
    const applied = appliedAtById.get(p.application_id)
    if (!applied) continue
    const ms = new Date(p.hired_at).getTime() - new Date(applied).getTime()
    if (ms < 0) continue                                       // defensive: clock skew or backdated edit
    durations.push(ms / 86_400_000)
  }
  durations.sort((a, b) => a - b)
  if (durations.length === 0) {
    return { window_days: days, sample_size: 0, median_days: null, p25_days: null, p75_days: null, min_days: null, max_days: null }
  }

  const pct = (q: number) => {
    const idx = Math.floor(q * (durations.length - 1))
    return round1(durations[idx])
  }
  return {
    window_days: days,
    sample_size: durations.length,
    median_days: pct(0.50),
    p25_days:    pct(0.25),
    p75_days:    pct(0.75),
    min_days:    round1(durations[0]),
    max_days:    round1(durations[durations.length - 1]),
  }
}

// ── 3. Real cost per active hire (cohort) ───────────────────────────────────
// For employees whose application landed in the window AND are currently active,
// sum the net amount across all payslips written for them. Divide by headcount
// to get an honest average. This is the cross-vendor-impossible metric:
// Greenhouse doesn't see payslips, Rippling doesn't see application date.

export interface CostPerActiveHire {
  window_days:      number
  active_hires:     number                       // count of currently-active employees from cohort
  total_net_paid:   number                       // sum of net across all payslips for the cohort
  avg_per_hire:     number | null
  /** Per-employee breakdown (newest first) for the UI's drill-down list. */
  hires: Array<{
    employee_id:    string
    name:           string | null
    email:          string | null
    joined_at:      string | null
    payslip_count:  number
    total_net_paid: number
  }>
}

export async function getCostPerActiveHire(
  supabase: Supabase,
  orgId:    string,
  days:     number = 90,
): Promise<CostPerActiveHire> {
  const since = windowStart(days)

  // 1. Active employees whose linked application landed in the window.
  const empRes = await supabase
    .from('employee_profiles')
    .select(`
      id, application_id, joined_at,
      person:people(name, email),
      application:applications!employee_profiles_application_id_fkey(applied_at)
    `)
    .eq('org_id', orgId)
    .eq('status', 'active')
    .not('application_id', 'is', null)
  if (empRes.error) throw empRes.error
  type EmpRow = {
    id: string; application_id: string | null; joined_at: string | null
    person: { name: string | null; email: string | null } | null
    application: { applied_at: string } | null
  }
  const allActive = (empRes.data ?? []) as unknown as EmpRow[]
  const inWindow  = allActive.filter(e => e.application?.applied_at && e.application.applied_at >= since)
  if (inWindow.length === 0) {
    return { window_days: days, active_hires: 0, total_net_paid: 0, avg_per_hire: null, hires: [] }
  }

  // 2. Payslip aggregates for those employees, one query.
  const empIds = inWindow.map(e => e.id)
  const slipsRes = await supabase
    .from('payslips')
    .select('employee_id, net')
    .eq('org_id', orgId)
    .in('employee_id', empIds)
  if (slipsRes.error) throw slipsRes.error

  const totalsByEmp = new Map<string, { count: number; net: number }>()
  for (const e of empIds) totalsByEmp.set(e, { count: 0, net: 0 })
  for (const s of ((slipsRes.data ?? []) as Array<{ employee_id: string; net: number }>)) {
    const t = totalsByEmp.get(s.employee_id)!
    t.count += 1
    t.net   += Number(s.net)
  }

  const hires = inWindow.map(e => ({
    employee_id:    e.id,
    name:           e.person?.name  ?? null,
    email:          e.person?.email ?? null,
    joined_at:      e.joined_at,
    payslip_count:  totalsByEmp.get(e.id)!.count,
    total_net_paid: round2(totalsByEmp.get(e.id)!.net),
  }))
  hires.sort((a, b) => (b.total_net_paid - a.total_net_paid))

  const total_net_paid = round2(hires.reduce((a, h) => a + h.total_net_paid, 0))
  return {
    window_days:    days,
    active_hires:   hires.length,
    total_net_paid,
    avg_per_hire:   hires.length > 0 ? round2(total_net_paid / hires.length) : null,
    hires,
  }
}

// ── 4. Tenure distribution (current actives) ────────────────────────────────
// Buckets all currently-active employees by tenure (joined_at → now). Buckets
// match the standard HR cohorts: <90d, 90d-1y, 1-2y, 2-5y, 5y+. Not gated by
// the time window — tenure is intrinsically all-time.

export interface TenureBucket { label: string; min_months: number; max_months: number | null; count: number }
export interface TenureDistribution {
  total_active: number
  buckets:      TenureBucket[]
  /** Median tenure in months, computed across all current actives. */
  median_months: number | null
}

const TENURE_BUCKET_SPECS: Array<{ label: string; min_months: number; max_months: number | null }> = [
  { label: '< 3 months', min_months: 0,  max_months: 3   },
  { label: '3–12 months', min_months: 3,  max_months: 12  },
  { label: '1–2 years',  min_months: 12, max_months: 24  },
  { label: '2–5 years',  min_months: 24, max_months: 60  },
  { label: '5+ years',   min_months: 60, max_months: null },
]

export async function getTenureDistribution(
  supabase: Supabase,
  orgId:    string,
): Promise<TenureDistribution> {
  const res = await supabase
    .from('employee_profiles')
    .select('joined_at')
    .eq('org_id', orgId)
    .eq('status', 'active')
    .not('joined_at', 'is', null)
  if (res.error) throw res.error
  const rows = (res.data ?? []) as Array<{ joined_at: string }>

  const now = Date.now()
  const tenures = rows
    .map(r => (now - new Date(r.joined_at).getTime()) / (86_400_000 * 30.4375))   // months avg
    .filter(m => m >= 0)
    .sort((a, b) => a - b)

  const buckets: TenureBucket[] = TENURE_BUCKET_SPECS.map(spec => {
    const count = tenures.filter(m => m >= spec.min_months && (spec.max_months === null || m < spec.max_months)).length
    return { ...spec, count }
  })

  const median = tenures.length > 0 ? round1(tenures[Math.floor((tenures.length - 1) / 2)]) : null

  return {
    total_active:  tenures.length,
    buckets,
    median_months: median,
  }
}

// ── 5. Compensation drift ───────────────────────────────────────────────────
// For every active employee with at least TWO comp records on file, compute
// the % change from the earliest record (usually the offer) to the latest
// record (their current comp). Returns aggregate stats + a per-employee
// list. This is the immutable-history table doing actual work — same DB
// holds the offer AND the current pay AND who that person is.

export interface CompDriftRow {
  employee_id:  string
  name:         string | null
  email:        string | null
  joined_at:    string | null
  records:      number                          // count of comp_records on file
  first_amount: number                          // earliest base_salary
  current_amount: number                        // latest base_salary
  first_date:   string                          // earliest effective_date
  current_date: string                          // latest effective_date
  pct_change:   number                          // (current - first) / first × 100, rounded to 0.1
}

export interface CompDrift {
  with_history: number                          // employees with 2+ records (the denominator)
  median_pct:   number | null
  p25_pct:      number | null
  p75_pct:      number | null
  rows:         CompDriftRow[]                  // sorted by pct_change desc
}

export async function getCompDrift(
  supabase: Supabase,
  orgId:    string,
): Promise<CompDrift> {
  // 1. All active employees with display name/email.
  const empRes = await supabase
    .from('employee_profiles')
    .select('id, joined_at, person:people(name, email)')
    .eq('org_id', orgId)
    .eq('status', 'active')
  if (empRes.error) throw empRes.error
  type EmpRow = { id: string; joined_at: string | null; person: { name: string | null; email: string | null } | null }
  const employees = (empRes.data ?? []) as unknown as EmpRow[]
  if (employees.length === 0) return { with_history: 0, median_pct: null, p25_pct: null, p75_pct: null, rows: [] }

  // 2. Their comp records in one round-trip. Order by effective_date ASC so
  //    earliest is at the head; we'll bucket per employee in JS.
  const empIds = employees.map(e => e.id)
  const compRes = await supabase
    .from('compensation_records')
    .select('employee_id, base_salary, effective_date')
    .eq('org_id', orgId)
    .in('employee_id', empIds)
    .order('effective_date', { ascending: true })
  if (compRes.error) throw compRes.error
  type CompRow = { employee_id: string; base_salary: number; effective_date: string }
  const recordsByEmp = new Map<string, CompRow[]>()
  for (const r of ((compRes.data ?? []) as CompRow[])) {
    const arr = recordsByEmp.get(r.employee_id) ?? []
    arr.push(r); recordsByEmp.set(r.employee_id, arr)
  }

  // 3. Compute drift per employee that has ≥ 2 records.
  const rows: CompDriftRow[] = []
  for (const e of employees) {
    const list = recordsByEmp.get(e.id) ?? []
    if (list.length < 2) continue
    const first   = list[0]
    const current = list[list.length - 1]
    const firstAmt   = Number(first.base_salary)
    const currentAmt = Number(current.base_salary)
    if (firstAmt <= 0) continue                                 // avoid div-by-zero on bad data
    rows.push({
      employee_id:  e.id,
      name:         e.person?.name  ?? null,
      email:        e.person?.email ?? null,
      joined_at:    e.joined_at,
      records:      list.length,
      first_amount: firstAmt,
      current_amount: currentAmt,
      first_date:   first.effective_date,
      current_date: current.effective_date,
      pct_change:   round1(((currentAmt - firstAmt) / firstAmt) * 100),
    })
  }
  rows.sort((a, b) => b.pct_change - a.pct_change)

  // 4. Distribution stats. Median + IQR is more honest than mean for comp.
  const sorted = rows.map(r => r.pct_change).sort((a, b) => a - b)
  const pct = (q: number) => sorted.length > 0 ? sorted[Math.floor(q * (sorted.length - 1))] : null
  return {
    with_history: rows.length,
    median_pct:   pct(0.50),
    p25_pct:      pct(0.25),
    p75_pct:      pct(0.75),
    rows,
  }
}

// ── 6. Source-to-retention ──────────────────────────────────────────────────
// Groups historical applications by their `source` value (applied / sourced /
// referral / imported / manual), then per-source asks: what % were hired, and
// of those, what % are still active today? This is the cross-vendor moat made
// concrete: the ATS knows source, the HRIS knows current status. Same DB →
// one query.
//
// Window-free on purpose. Retention only means something when you can look
// back across hire cohorts; restricting to the window would hide the signal.
// Each source row carries its own counts so the UI can show absolute numbers
// alongside the rates (a 100% retention rate from one hire is meaningless;
// the UI surfaces the n).

export interface SourceRetentionRow {
  source:        string
  apps:          number                         // total applications with this source
  hired:         number                         // ...whose status reached 'hired'
  active_now:    number                         // ...whose linked employee_profile is currently active
  terminated:    number                         // ...whose employee_profile is terminated
  hire_rate:     number | null                  // hired / apps
  retention_rate: number | null                 // active_now / (active_now + terminated)
}

export interface SourceRetention {
  total_apps:  number
  rows:        SourceRetentionRow[]             // sorted by hire_rate desc (then by apps desc)
}

export async function getSourceRetention(
  supabase: Supabase,
  orgId:    string,
): Promise<SourceRetention> {
  // 1. All applications (all time) with source + their linked employee status.
  const appsRes = await supabase
    .from('applications')
    .select(`
      id, source, status,
      employee:employee_profiles!employee_profiles_application_id_fkey (status)
    `)
    .eq('org_id', orgId)
  if (appsRes.error) throw appsRes.error
  type AppRow = {
    id: string
    source: string
    status: string
    // The join can return an array (one-to-many side) — defensive.
    employee: { status: string } | { status: string }[] | null
  }
  const apps = (appsRes.data ?? []) as unknown as AppRow[]
  if (apps.length === 0) return { total_apps: 0, rows: [] }

  // 2. Tally per source.
  const tally = new Map<string, { apps: number; hired: number; active: number; terminated: number }>()
  for (const a of apps) {
    const src = a.source || 'unknown'
    const t = tally.get(src) ?? { apps: 0, hired: 0, active: 0, terminated: 0 }
    t.apps += 1
    if (a.status === 'hired') t.hired += 1
    // employee may be the join result — single object, array, or null.
    const empStatus = Array.isArray(a.employee) ? a.employee[0]?.status : a.employee?.status
    if (empStatus === 'active')     t.active     += 1
    if (empStatus === 'terminated') t.terminated += 1
    tally.set(src, t)
  }

  const rows: SourceRetentionRow[] = []
  for (const [source, t] of Array.from(tally.entries())) {
    const denom = t.active + t.terminated
    rows.push({
      source,
      apps:           t.apps,
      hired:          t.hired,
      active_now:     t.active,
      terminated:     t.terminated,
      hire_rate:      t.apps  > 0 ? round1((t.hired   / t.apps)  * 100) / 100 : null,
      retention_rate: denom   > 0 ? round1((t.active  / denom)   * 100) / 100 : null,
    })
  }
  rows.sort((a, b) =>
    (b.hire_rate ?? 0) - (a.hire_rate ?? 0)
    || b.apps - a.apps,
  )

  return { total_apps: apps.length, rows }
}

// ── 7. Monthly hiring trends ────────────────────────────────────────────────
// Rolls up applications / hires / joined by calendar month for the last N
// months. UI plots three lines on one chart so you see the funnel move
// through time. Same canonical joins as the funnel card — but bucketed
// instead of summed.
//
// Bucketing is done in JS because Supabase doesn't give us a portable
// date_trunc('month') across the client lib without an RPC. The dataset
// is small (months × org), so this is fine.

export interface MonthlyTrendPoint {
  month:    string                              // YYYY-MM
  apps:     number
  hired:    number
  joined:   number
}

export interface MonthlyHiringTrends {
  months: number
  points: MonthlyTrendPoint[]                   // oldest-first, length === months
}

function monthKey(iso: string): string {
  // YYYY-MM from any ISO timestamp / YYYY-MM-DD string
  return iso.slice(0, 7)
}

export async function getMonthlyHiringTrends(
  supabase: Supabase,
  orgId:    string,
  months:   number = 12,
): Promise<MonthlyHiringTrends> {
  // Window covers the last N full months including current; align to the
  // first day of (current month - N + 1) so a Jun 10 view of 12 months
  // shows Jul of the previous year through Jun of this year.
  const now    = new Date()
  const start  = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (months - 1), 1))
  const startISO = start.toISOString()

  // 1. All applications in the window (apps + hired counts derived here).
  const appsRes = await supabase
    .from('applications')
    .select('id, status, applied_at')
    .eq('org_id', orgId)
    .gte('applied_at', startISO)
  if (appsRes.error) throw appsRes.error
  type AppRow = { id: string; status: string; applied_at: string }
  const apps = (appsRes.data ?? []) as AppRow[]

  // 2. Joined dates from employee_profiles overlapping the window.
  const empRes = await supabase
    .from('employee_profiles')
    .select('joined_at')
    .eq('org_id', orgId)
    .gte('joined_at', startISO)
    .not('joined_at', 'is', null)
  if (empRes.error) throw empRes.error
  type EmpRow = { joined_at: string }
  const joins = (empRes.data ?? []) as EmpRow[]

  // 3. Build N empty buckets in chronological order so months with zero
  //    activity still render (avoids a hole in the chart).
  const points: MonthlyTrendPoint[] = []
  for (let i = 0; i < months; i++) {
    const d = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + i, 1))
    points.push({ month: monthKey(d.toISOString()), apps: 0, hired: 0, joined: 0 })
  }
  const idxByMonth = new Map(points.map((p, i) => [p.month, i]))

  // 4. Fill counts.
  for (const a of apps) {
    const idx = idxByMonth.get(monthKey(a.applied_at))
    if (idx === undefined) continue
    points[idx].apps += 1
    if (a.status === 'hired') points[idx].hired += 1
  }
  for (const j of joins) {
    const idx = idxByMonth.get(monthKey(j.joined_at))
    if (idx === undefined) continue
    points[idx].joined += 1
  }

  return { months, points }
}

// ── helpers ─────────────────────────────────────────────────────────────────
function round1(n: number): number { return Math.round(n * 10) / 10 }
function round2(n: number): number { return Math.round(n * 100) / 100 }
