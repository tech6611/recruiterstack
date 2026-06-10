'use client'

import { useAuth } from '@clerk/nextjs'
import { useCallback, useEffect, useState } from 'react'
import { BarChart3, TrendingUp, Wallet, Users, AlertCircle, Sparkles, Download, ArrowUpRight, GitBranch } from 'lucide-react'
import { downloadCsv, todayStamp } from '@/lib/api/csv-export'

// ── Shape returned by /api/analytics/people ────────────────────────────────
// Each metric wrapped in { data | error } so one failing query doesn't
// break the whole page.
interface Wrapped<T> { data: T | null; error: string | null }
interface ConversionFunnel {
  apps_total:   number
  apps_hired:   number
  apps_joined:  number
  apps_active:  number
  hire_rate:    number | null
  join_rate:    number | null
  active_rate:  number | null
}
interface TimeToHire {
  sample_size: number
  median_days: number | null
  p25_days:    number | null
  p75_days:    number | null
  min_days:    number | null
  max_days:    number | null
}
interface CostHire {
  active_hires:   number
  total_net_paid: number
  avg_per_hire:   number | null
  hires: Array<{
    employee_id:    string
    name:           string | null
    email:          string | null
    joined_at:      string | null
    payslip_count:  number
    total_net_paid: number
  }>
}
interface TenureBucket { label: string; count: number }
interface Tenure {
  total_active:  number
  buckets:       TenureBucket[]
  median_months: number | null
}
interface CompDriftRow {
  employee_id:    string
  name:           string | null
  email:          string | null
  records:        number
  first_amount:   number
  current_amount: number
  first_date:     string
  current_date:   string
  pct_change:     number
}
interface CompDrift {
  with_history: number
  median_pct:   number | null
  p25_pct:      number | null
  p75_pct:      number | null
  rows:         CompDriftRow[]
}

interface SourceRow {
  source:         string
  apps:           number
  hired:          number
  active_now:     number
  terminated:     number
  hire_rate:      number | null
  retention_rate: number | null
}
interface SourceRetention {
  total_apps: number
  rows:       SourceRow[]
}

interface AnalyticsResponse {
  window_days:           number
  conversion_funnel:     Wrapped<ConversionFunnel>
  time_to_hire:          Wrapped<TimeToHire>
  cost_per_active_hire:  Wrapped<CostHire>
  tenure_distribution:   Wrapped<Tenure>
  comp_drift:            Wrapped<CompDrift>
  source_retention:      Wrapped<SourceRetention>
}

function fmtMoney(n: number): string {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n)
}
function pct(n: number | null): string {
  return n === null ? '—' : `${Math.round(n * 100)}%`
}

const WINDOWS = [
  { label: '30 days',  days: 30  },
  { label: '90 days',  days: 90  },
  { label: '180 days', days: 180 },
  { label: '365 days', days: 365 },
]

export default function PeopleAnalyticsPage() {
  const { orgId } = useAuth()
  const [data, setData]       = useState<AnalyticsResponse | null>(null)
  const [days, setDays]       = useState(90)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    setLoading(true)
    const res = await fetch(`/api/analytics/people?days=${days}`)
    if (res.ok) setData(((await res.json()).data) as AnalyticsResponse)
    setLoading(false)
  }, [days])

  useEffect(() => { if (orgId) refresh() }, [orgId, refresh])

  return (
    <div className="p-8">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50">
            <BarChart3 className="h-4 w-4 text-emerald-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">People analytics</h1>
            <p className="text-sm text-slate-500">Cross-module metrics — joins ATS funnel data with HRIS retention and Payroll cost.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-slate-500">Window:</span>
          {WINDOWS.map(w => (
            <button
              key={w.days}
              onClick={() => setDays(w.days)}
              className={`rounded-lg px-2.5 py-1.5 text-xs font-medium ${days === w.days ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
            >
              {w.label}
            </button>
          ))}
        </div>
      </div>

      {/* Unified-data framing — explicit about what's being joined and why this is */}
      {/* not possible in a single-vendor stack. */}
      <div className="mb-6 flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
        <Sparkles className="mt-0.5 h-4 w-4 flex-none" />
        <div>
          These four numbers all read from the same database. The funnel joins applications → hires → joined → currently-active in one query;
          cost-per-hire joins your payroll runs against the apply date. With Greenhouse + Rippling those two halves live in different vendors.
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {/* 1. Conversion funnel */}
        <Card icon={<Users className="h-4 w-4 text-emerald-600" />}
              title="Conversion funnel"
              subtitle={`Last ${days} days · ATS → HRIS`}
              onExport={data?.conversion_funnel.data ? () => exportFunnel(data.conversion_funnel.data!, days) : undefined}>
          <FunnelCard wrapped={data?.conversion_funnel} loading={loading} />
        </Card>

        {/* 2. Time-to-hire */}
        <Card icon={<TrendingUp className="h-4 w-4 text-emerald-600" />}
              title="Time-to-hire"
              subtitle={`Last ${days} days · applied_at → hired_at`}
              onExport={data?.time_to_hire.data ? () => exportTimeToHire(data.time_to_hire.data!, days) : undefined}>
          <TimeToHireCard wrapped={data?.time_to_hire} loading={loading} />
        </Card>

        {/* 3. Cost per active hire */}
        <Card icon={<Wallet className="h-4 w-4 text-emerald-600" />}
              title="Real cost per active hire"
              subtitle={`Last ${days} days · Payroll × HRIS cohort`}
              onExport={data?.cost_per_active_hire.data ? () => exportCost(data.cost_per_active_hire.data!, days) : undefined}>
          <CostCard wrapped={data?.cost_per_active_hire} loading={loading} />
        </Card>

        {/* 4. Tenure distribution */}
        <Card icon={<BarChart3 className="h-4 w-4 text-emerald-600" />}
              title="Tenure distribution"
              subtitle="All current actives · HRIS"
              onExport={data?.tenure_distribution.data ? () => exportTenure(data.tenure_distribution.data!) : undefined}>
          <TenureCard wrapped={data?.tenure_distribution} loading={loading} />
        </Card>

        {/* 5. Comp drift */}
        <Card icon={<ArrowUpRight className="h-4 w-4 text-emerald-600" />}
              title="Compensation drift"
              subtitle="All actives w/ 2+ comp records · HRIS"
              onExport={data?.comp_drift.data ? () => exportDrift(data.comp_drift.data!) : undefined}>
          <CompDriftCard wrapped={data?.comp_drift} loading={loading} />
        </Card>

        {/* 6. Source-to-retention — full width because this is *the* killer chart */}
        <div className="md:col-span-2">
          <Card icon={<GitBranch className="h-4 w-4 text-emerald-600" />}
                title="Source → retention"
                subtitle="All-time · ATS source × HRIS current status"
                onExport={data?.source_retention.data ? () => exportSource(data.source_retention.data!) : undefined}>
            <SourceRetentionCard wrapped={data?.source_retention} loading={loading} />
          </Card>
        </div>
      </div>
    </div>
  )
}

// ── Card scaffold ──────────────────────────────────────────────────────────
function Card({ icon, title, subtitle, onExport, children }: {
  icon: React.ReactNode
  title: string
  subtitle: string
  onExport?: () => void
  children: React.ReactNode
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          {icon}
          <h2 className="text-sm font-semibold text-slate-800">{title}</h2>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-medium uppercase tracking-wider text-slate-400">{subtitle}</span>
          {onExport && (
            <button
              onClick={onExport}
              className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              title="Download CSV"
            >
              <Download className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
      {children}
    </div>
  )
}

// ── Loading / error skeletons ──────────────────────────────────────────────
function LoadingRow() { return <div className="h-12 animate-pulse rounded-lg bg-slate-100" /> }
function ErrorRow({ msg }: { msg: string }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
      <AlertCircle className="mt-0.5 h-3.5 w-3.5 flex-none" />
      <div>{msg}</div>
    </div>
  )
}

// ── 1. Funnel ──────────────────────────────────────────────────────────────
function FunnelCard({ wrapped, loading }: { wrapped: Wrapped<ConversionFunnel> | undefined; loading: boolean }) {
  if (loading)         return <LoadingRow />
  if (!wrapped)        return null
  if (wrapped.error)   return <ErrorRow msg={wrapped.error} />
  const d = wrapped.data!
  const steps = [
    { label: 'Applications', count: d.apps_total,  to: null },
    { label: 'Hired',        count: d.apps_hired,  to: d.hire_rate   },
    { label: 'Joined',       count: d.apps_joined, to: d.join_rate   },
    { label: 'Still active', count: d.apps_active, to: d.active_rate },
  ]
  const maxCount = Math.max(1, ...steps.map(s => s.count))
  return (
    <div className="space-y-2">
      {steps.map(s => (
        <div key={s.label} className="grid grid-cols-12 items-center gap-3">
          <div className="col-span-3 text-xs font-medium text-slate-600">{s.label}</div>
          <div className="col-span-7">
            <div className="h-3 w-full overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-emerald-500" style={{ width: `${(s.count / maxCount) * 100}%` }} />
            </div>
          </div>
          <div className="col-span-2 text-right text-sm font-semibold text-slate-900">
            {s.count}
            {s.to !== null && <span className="ml-1 text-xs font-normal text-slate-400">({pct(s.to)})</span>}
          </div>
        </div>
      ))}
    </div>
  )
}

// ── 2. Time-to-hire ────────────────────────────────────────────────────────
function TimeToHireCard({ wrapped, loading }: { wrapped: Wrapped<TimeToHire> | undefined; loading: boolean }) {
  if (loading)       return <LoadingRow />
  if (!wrapped)      return null
  if (wrapped.error) return <ErrorRow msg={wrapped.error} />
  const d = wrapped.data!
  if (d.sample_size === 0) return <div className="text-sm text-slate-400">No hires in this window.</div>
  return (
    <div className="space-y-3">
      <div className="flex items-baseline gap-3">
        <div className="text-3xl font-bold text-slate-900">{d.median_days}</div>
        <div className="text-sm text-slate-500">days · median</div>
      </div>
      <div className="grid grid-cols-3 gap-2 text-xs">
        <Stat label="p25"  value={`${d.p25_days} d`} />
        <Stat label="p75"  value={`${d.p75_days} d`} />
        <Stat label="n"    value={String(d.sample_size)} />
      </div>
      <div className="text-xs text-slate-400">
        Range: {d.min_days}–{d.max_days} days
      </div>
    </div>
  )
}

// ── 3. Cost per active hire ────────────────────────────────────────────────
function CostCard({ wrapped, loading }: { wrapped: Wrapped<CostHire> | undefined; loading: boolean }) {
  if (loading)       return <LoadingRow />
  if (!wrapped)      return null
  if (wrapped.error) return <ErrorRow msg={wrapped.error} />
  const d = wrapped.data!
  if (d.active_hires === 0) return <div className="text-sm text-slate-400">No active hires from this window with payslips yet.</div>
  return (
    <div className="space-y-3">
      <div className="flex items-baseline gap-3">
        <div className="text-3xl font-bold text-slate-900">{d.avg_per_hire !== null ? fmtMoney(d.avg_per_hire) : '—'}</div>
        <div className="text-sm text-slate-500">avg net paid per hire</div>
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <Stat label="Active hires" value={String(d.active_hires)} />
        <Stat label="Total net paid" value={fmtMoney(d.total_net_paid)} />
      </div>
      {d.hires.length > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer font-medium text-slate-500 hover:text-slate-700">By employee</summary>
          <div className="mt-2 space-y-1">
            {d.hires.slice(0, 8).map(h => (
              <div key={h.employee_id} className="flex items-center justify-between text-slate-600">
                <span>{h.name ?? '(unknown)'} <span className="text-slate-400">· {h.payslip_count} payslip{h.payslip_count === 1 ? '' : 's'}</span></span>
                <span className="font-medium text-slate-800">{fmtMoney(h.total_net_paid)}</span>
              </div>
            ))}
            {d.hires.length > 8 && <div className="text-slate-400">… and {d.hires.length - 8} more</div>}
          </div>
        </details>
      )}
    </div>
  )
}

// ── 4. Tenure distribution ─────────────────────────────────────────────────
function TenureCard({ wrapped, loading }: { wrapped: Wrapped<Tenure> | undefined; loading: boolean }) {
  if (loading)       return <LoadingRow />
  if (!wrapped)      return null
  if (wrapped.error) return <ErrorRow msg={wrapped.error} />
  const d = wrapped.data!
  if (d.total_active === 0) return <div className="text-sm text-slate-400">No active employees yet.</div>
  const max = Math.max(1, ...d.buckets.map(b => b.count))
  return (
    <div className="space-y-3">
      <div className="flex items-baseline gap-3">
        <div className="text-3xl font-bold text-slate-900">{d.median_months ?? '—'}</div>
        <div className="text-sm text-slate-500">months · median tenure</div>
      </div>
      <div className="space-y-1.5">
        {d.buckets.map(b => (
          <div key={b.label} className="grid grid-cols-12 items-center gap-2 text-xs">
            <div className="col-span-4 text-slate-600">{b.label}</div>
            <div className="col-span-6">
              <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-emerald-500" style={{ width: `${(b.count / max) * 100}%` }} />
              </div>
            </div>
            <div className="col-span-2 text-right font-semibold text-slate-700">{b.count}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── 5. Comp drift ──────────────────────────────────────────────────────────
function CompDriftCard({ wrapped, loading }: { wrapped: Wrapped<CompDrift> | undefined; loading: boolean }) {
  if (loading)       return <LoadingRow />
  if (!wrapped)      return null
  if (wrapped.error) return <ErrorRow msg={wrapped.error} />
  const d = wrapped.data!
  if (d.with_history === 0) {
    return (
      <div className="text-sm text-slate-400">
        No employees with multiple comp records yet — drift surfaces once people receive their first raise.
      </div>
    )
  }
  const fmtPct = (n: number | null) => n === null ? '—' : (n >= 0 ? `+${n}%` : `${n}%`)
  return (
    <div className="space-y-3">
      <div className="flex items-baseline gap-3">
        <div className={`text-3xl font-bold ${(d.median_pct ?? 0) >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
          {fmtPct(d.median_pct)}
        </div>
        <div className="text-sm text-slate-500">median change · first → current</div>
      </div>
      <div className="grid grid-cols-3 gap-2 text-xs">
        <Stat label="p25"   value={fmtPct(d.p25_pct)} />
        <Stat label="p75"   value={fmtPct(d.p75_pct)} />
        <Stat label="n"     value={String(d.with_history)} />
      </div>
      {d.rows.length > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer font-medium text-slate-500 hover:text-slate-700">By employee</summary>
          <div className="mt-2 space-y-1">
            {d.rows.slice(0, 8).map(r => (
              <div key={r.employee_id} className="flex items-center justify-between text-slate-600">
                <span className="truncate">
                  {r.name ?? '(unknown)'}
                  <span className="ml-1 text-slate-400">· {r.records} records</span>
                </span>
                <span className={`shrink-0 font-medium ${r.pct_change >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                  {fmtPct(r.pct_change)}
                </span>
              </div>
            ))}
            {d.rows.length > 8 && <div className="text-slate-400">… and {d.rows.length - 8} more</div>}
          </div>
        </details>
      )}
    </div>
  )
}

// ── 6. Source-to-retention ─────────────────────────────────────────────────
// Horizontal grouped bars: per source, show hire-rate alongside retention-rate.
// The two metrics are intentionally on the same scale (both 0–100%) so the
// eye can compare without thinking. Total app count is shown next to each
// row to ground the percentages — 100% retention from one hire is noise.
function SourceRetentionCard({ wrapped, loading }: { wrapped: Wrapped<SourceRetention> | undefined; loading: boolean }) {
  if (loading)       return <LoadingRow />
  if (!wrapped)      return null
  if (wrapped.error) return <ErrorRow msg={wrapped.error} />
  const d = wrapped.data!
  if (d.total_apps === 0) return <div className="text-sm text-slate-400">No applications yet.</div>

  return (
    <div className="space-y-3">
      <div className="text-xs text-slate-500">
        Two bars per source — <span className="font-semibold text-emerald-700">hire rate</span> (apps → hired)
        and <span className="font-semibold text-sky-700">retention rate</span> (hired → still active).
        Sources with few apps have noisy rates; the n column grounds it.
      </div>
      <div className="overflow-hidden rounded-lg border border-slate-200">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold text-slate-500">
              <th className="px-4 py-2 w-32">Source</th>
              <th className="px-4 py-2 text-right w-16">n apps</th>
              <th className="px-4 py-2 text-right w-16">hired</th>
              <th className="px-4 py-2">Hire rate</th>
              <th className="px-4 py-2 text-right w-16">active</th>
              <th className="px-4 py-2">Retention</th>
            </tr>
          </thead>
          <tbody>
            {d.rows.map(r => (
              <tr key={r.source} className="border-b border-slate-100 last:border-0">
                <td className="px-4 py-2 font-medium capitalize text-slate-800">{r.source}</td>
                <td className="px-4 py-2 text-right text-slate-700">{r.apps}</td>
                <td className="px-4 py-2 text-right text-slate-700">{r.hired}</td>
                <td className="px-4 py-2">
                  <RateBar rate={r.hire_rate} color="bg-emerald-500" />
                </td>
                <td className="px-4 py-2 text-right text-slate-700">{r.active_now}</td>
                <td className="px-4 py-2">
                  <RateBar rate={r.retention_rate} color="bg-sky-500" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function RateBar({ rate, color }: { rate: number | null; color: string }) {
  if (rate === null) return <span className="text-xs text-slate-400">—</span>
  const pctStr = `${Math.round(rate * 100)}%`
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-24 overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full rounded-full ${color}`} style={{ width: pctStr }} />
      </div>
      <span className="text-xs text-slate-600">{pctStr}</span>
    </div>
  )
}

// ── CSV exporters ──────────────────────────────────────────────────────────
// One function per card. Each shapes its card's data into rows + headers
// and triggers a browser download via the shared helper.

function exportFunnel(d: ConversionFunnel, days: number) {
  downloadCsv(`funnel-${days}d-${todayStamp()}.csv`, [
    ['Step', 'Count', 'Conversion from previous'],
    ['Applications', d.apps_total,  ''],
    ['Hired',        d.apps_hired,  d.hire_rate   !== null ? `${Math.round(d.hire_rate   * 100)}%` : ''],
    ['Joined',       d.apps_joined, d.join_rate   !== null ? `${Math.round(d.join_rate   * 100)}%` : ''],
    ['Still active', d.apps_active, d.active_rate !== null ? `${Math.round(d.active_rate * 100)}%` : ''],
  ])
}

function exportTimeToHire(d: TimeToHire, days: number) {
  downloadCsv(`time-to-hire-${days}d-${todayStamp()}.csv`, [
    ['Metric',     'Days'],
    ['Median',     d.median_days ?? ''],
    ['p25',        d.p25_days    ?? ''],
    ['p75',        d.p75_days    ?? ''],
    ['Min',        d.min_days    ?? ''],
    ['Max',        d.max_days    ?? ''],
    ['Sample size', d.sample_size],
  ])
}

function exportCost(d: CostHire, days: number) {
  const header = [['Employee', 'Email', 'Joined at', 'Payslip count', 'Total net paid (INR)']]
  const body   = d.hires.map(h => [h.name ?? '', h.email ?? '', h.joined_at ?? '', h.payslip_count, h.total_net_paid])
  const footer = [
    [],
    ['Cohort size', d.active_hires],
    ['Total net paid', d.total_net_paid],
    ['Avg per hire',   d.avg_per_hire ?? ''],
  ]
  downloadCsv(`cost-per-hire-${days}d-${todayStamp()}.csv`, [...header, ...body, ...footer])
}

function exportTenure(d: Tenure) {
  downloadCsv(`tenure-${todayStamp()}.csv`, [
    ['Bucket', 'Count'],
    ...d.buckets.map(b => [b.label, b.count]),
    [],
    ['Total active',   d.total_active],
    ['Median months',  d.median_months ?? ''],
  ])
}

function exportDrift(d: CompDrift) {
  downloadCsv(`comp-drift-${todayStamp()}.csv`, [
    ['Employee', 'Email', 'Records', 'First amount', 'First date', 'Current amount', 'Current date', '% change'],
    ...d.rows.map(r => [r.name ?? '', r.email ?? '', r.records, r.first_amount, r.first_date, r.current_amount, r.current_date, r.pct_change]),
    [],
    ['Employees with history', d.with_history],
    ['Median %',  d.median_pct ?? ''],
    ['p25 %',     d.p25_pct    ?? ''],
    ['p75 %',     d.p75_pct    ?? ''],
  ])
}

function exportSource(d: SourceRetention) {
  downloadCsv(`source-retention-${todayStamp()}.csv`, [
    ['Source', 'Apps', 'Hired', 'Hire rate %', 'Active now', 'Terminated', 'Retention rate %'],
    ...d.rows.map(r => [
      r.source,
      r.apps,
      r.hired,
      r.hire_rate      !== null ? Math.round(r.hire_rate      * 100) : '',
      r.active_now,
      r.terminated,
      r.retention_rate !== null ? Math.round(r.retention_rate * 100) : '',
    ]),
    [],
    ['Total apps', d.total_apps],
  ])
}

// ── small ──────────────────────────────────────────────────────────────────
function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-50 px-2.5 py-1.5">
      <div className="text-[10px] font-medium uppercase tracking-wider text-slate-400">{label}</div>
      <div className="text-sm font-semibold text-slate-800">{value}</div>
    </div>
  )
}
