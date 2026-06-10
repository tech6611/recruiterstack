'use client'

import { useAuth } from '@clerk/nextjs'
import { useCallback, useEffect, useState } from 'react'
import { BarChart3, TrendingUp, Wallet, Users, AlertCircle, Sparkles } from 'lucide-react'

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
interface AnalyticsResponse {
  window_days:           number
  conversion_funnel:     Wrapped<ConversionFunnel>
  time_to_hire:          Wrapped<TimeToHire>
  cost_per_active_hire:  Wrapped<CostHire>
  tenure_distribution:   Wrapped<Tenure>
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
              subtitle={`Last ${days} days · ATS → HRIS`}>
          <FunnelCard wrapped={data?.conversion_funnel} loading={loading} />
        </Card>

        {/* 2. Time-to-hire */}
        <Card icon={<TrendingUp className="h-4 w-4 text-emerald-600" />}
              title="Time-to-hire"
              subtitle={`Last ${days} days · applied_at → hired_at`}>
          <TimeToHireCard wrapped={data?.time_to_hire} loading={loading} />
        </Card>

        {/* 3. Cost per active hire */}
        <Card icon={<Wallet className="h-4 w-4 text-emerald-600" />}
              title="Real cost per active hire"
              subtitle={`Last ${days} days · Payroll × HRIS cohort`}>
          <CostCard wrapped={data?.cost_per_active_hire} loading={loading} />
        </Card>

        {/* 4. Tenure distribution */}
        <Card icon={<BarChart3 className="h-4 w-4 text-emerald-600" />}
              title="Tenure distribution"
              subtitle="All current actives · HRIS">
          <TenureCard wrapped={data?.tenure_distribution} loading={loading} />
        </Card>
      </div>
    </div>
  )
}

// ── Card scaffold ──────────────────────────────────────────────────────────
function Card({ icon, title, subtitle, children }: { icon: React.ReactNode; title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="mb-4 flex items-start justify-between">
        <div className="flex items-center gap-2">
          {icon}
          <h2 className="text-sm font-semibold text-slate-800">{title}</h2>
        </div>
        <span className="text-[10px] font-medium uppercase tracking-wider text-slate-400">{subtitle}</span>
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

// ── small ──────────────────────────────────────────────────────────────────
function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-50 px-2.5 py-1.5">
      <div className="text-[10px] font-medium uppercase tracking-wider text-slate-400">{label}</div>
      <div className="text-sm font-semibold text-slate-800">{value}</div>
    </div>
  )
}
