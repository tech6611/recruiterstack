'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@clerk/nextjs'
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts'
import {
  Coins, Zap, ArrowDownToLine, ArrowUpFromLine, RefreshCw, Lock,
} from 'lucide-react'
import { useCapabilities } from '@/components/providers/CapabilitiesProvider'

// ── Types ─────────────────────────────────────────────────────────────────────

interface UsageData {
  days: number
  truncated: boolean
  totals: { cost: number; calls: number; input_tokens: number; output_tokens: number }
  per_feature: { module: string; calls: number; cost: number; input_tokens: number; output_tokens: number }[]
  per_model:   { model: string; calls: number; cost: number }[]
  per_user:    { user_id: string | null; name: string; email: string | null; calls: number; cost: number }[]
  trend:       { date: string; cost: number; calls: number }[]
}

const RANGES = [
  { days: 7,  label: '7 days' },
  { days: 30, label: '30 days' },
  { days: 90, label: '90 days' },
]

// ── Formatting helpers ────────────────────────────────────────────────────────

// Small fractional dollars need more precision than round-number sums.
function usd(n: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: n > 0 && n < 1 ? 4 : 2,
  }).format(n)
}

const int = (n: number) => n.toLocaleString('en-US')

// "2026-07-13" → "Jul 13"
function shortDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00')
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatCard({
  label, value, sub, icon: Icon, color,
}: {
  label: string; value: string; sub?: string; icon: React.ElementType; color: string
}) {
  return (
    <div className="rounded-2xl bg-white border border-slate-200 px-5 py-4 flex items-center gap-4">
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${color}`}>
        <Icon className="h-5 w-5 text-white" />
      </div>
      <div className="min-w-0">
        <p className="text-2xl font-bold text-slate-900 leading-tight truncate">{value}</p>
        <p className="text-xs font-medium text-slate-500">{label}</p>
        {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  )
}

function Panel({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-white border border-slate-200 overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100">
        <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
        {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
      </div>
      {children}
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function AiUsagePage() {
  const { orgId } = useAuth()
  const { can } = useCapabilities()
  const [days, setDays] = useState(30)
  const [data, setData] = useState<UsageData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/ai-usage?days=${days}`)
      if (!res.ok) {
        if (res.status === 403) throw new Error('forbidden')
        throw new Error('Failed to load AI usage')
      }
      const json = await res.json()
      setData(json.data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }, [days])

  useEffect(() => {
    if (orgId) load()
  }, [load, orgId])

  // ── Access gate ─────────────────────────────────────────────────────────────
  if (!can('settings:edit') || error === 'forbidden') {
    return (
      <div className="flex flex-col items-center justify-center gap-3 px-8 py-24 text-center">
        <Lock className="h-8 w-8 text-slate-400" />
        <h1 className="text-lg font-semibold text-slate-900">Admins only</h1>
        <p className="text-sm text-slate-500 max-w-sm">
          AI usage &amp; cost is limited to workspace admins. Ask an admin if you need access.
        </p>
      </div>
    )
  }

  const maxFeatureCost = Math.max(1, ...(data?.per_feature.map(f => f.cost) ?? [0]))
  const maxUserCost = Math.max(1, ...(data?.per_user.map(u => u.cost) ?? [0]))

  return (
    <div className="flex flex-col gap-6 px-8 py-8 max-w-7xl">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">AI usage &amp; cost</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Estimated Gemini spend for this workspace. Costs are approximate, based on token counts.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-slate-200 bg-white p-0.5">
            {RANGES.map(r => (
              <button
                key={r.days}
                onClick={() => setDays(r.days)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  days === r.days ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
          <button
            onClick={load}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 border border-slate-200 rounded-lg bg-white hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Error */}
      {error && error !== 'forbidden' && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
          {error}. <button onClick={load} className="font-medium underline">Try again</button>
        </div>
      )}

      {/* Loading skeleton */}
      {loading && !data && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[0, 1, 2, 3].map(i => (
            <div key={i} className="h-[88px] rounded-2xl bg-slate-100 animate-pulse" />
          ))}
        </div>
      )}

      {data && (
        <>
          {/* KPI row */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard label="Estimated cost" value={usd(data.totals.cost)} icon={Coins} color="bg-emerald-600" sub={`Last ${data.days} days`} />
            <StatCard label="AI calls" value={int(data.totals.calls)} icon={Zap} color="bg-slate-800" />
            <StatCard label="Input tokens" value={int(data.totals.input_tokens)} icon={ArrowDownToLine} color="bg-slate-500" />
            <StatCard label="Output tokens" value={int(data.totals.output_tokens)} icon={ArrowUpFromLine} color="bg-slate-500" />
          </div>

          {data.truncated && (
            <p className="text-xs text-amber-600">
              Showing a partial view — this period has more activity than we chart at once.
            </p>
          )}

          {/* Empty state */}
          {data.totals.calls === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white px-6 py-16 text-center">
              <Coins className="h-8 w-8 text-slate-300 mx-auto mb-3" />
              <h2 className="text-base font-semibold text-slate-900">No AI usage in this period</h2>
              <p className="text-sm text-slate-500 mt-1 max-w-md mx-auto">
                Once your team uses AI features — scoring candidates, drafting emails, parsing CVs — spend will show up here.
              </p>
            </div>
          ) : (
            <>
              {/* Trend chart */}
              <Panel title="Daily cost" subtitle={`Estimated spend per day over the last ${data.days} days`}>
                <div className="h-64 w-full px-3 py-4">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.trend} margin={{ top: 8, right: 16, left: 4, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                      <XAxis
                        dataKey="date"
                        tickFormatter={shortDate}
                        tick={{ fontSize: 11, fill: '#64748b' }}
                        minTickGap={24}
                        axisLine={{ stroke: '#e2e8f0' }}
                        tickLine={false}
                      />
                      <YAxis
                        tickFormatter={(v: number) => usd(v)}
                        tick={{ fontSize: 11, fill: '#64748b' }}
                        axisLine={false}
                        tickLine={false}
                        width={64}
                      />
                      <Tooltip
                        contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}
                        labelStyle={{ fontWeight: 600, color: '#0f172a' }}
                        labelFormatter={(l) => shortDate(String(l))}
                        formatter={(v) => [usd(Number(v)), 'Cost']}
                      />
                      <Bar dataKey="cost" fill="#1f7a5a" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Panel>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Per feature */}
                <Panel title="Cost by feature" subtitle="Which AI features are driving spend">
                  <div className="divide-y divide-slate-100">
                    {data.per_feature.map(f => (
                      <div key={f.module} className="px-5 py-3">
                        <div className="flex items-center justify-between gap-3 mb-1.5">
                          <span className="text-sm font-medium text-slate-800 truncate">{f.module}</span>
                          <span className="text-sm font-semibold text-slate-900 tabular-nums shrink-0">{usd(f.cost)}</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                          <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${(f.cost / maxFeatureCost) * 100}%` }} />
                        </div>
                        <p className="text-xs text-slate-400 mt-1">
                          {int(f.calls)} calls · {int(f.input_tokens + f.output_tokens)} tokens
                        </p>
                      </div>
                    ))}
                  </div>
                </Panel>

                {/* Per employee */}
                <Panel title="Cost by employee" subtitle="Who is triggering AI calls">
                  <div className="divide-y divide-slate-100">
                    {data.per_user.map((u, i) => (
                      <div key={u.user_id ?? `none-${i}`} className="px-5 py-3">
                        <div className="flex items-center justify-between gap-3 mb-1.5">
                          <span className="text-sm font-medium text-slate-800 truncate">
                            {u.name}
                            {u.email && <span className="text-slate-400 font-normal"> · {u.email}</span>}
                          </span>
                          <span className="text-sm font-semibold text-slate-900 tabular-nums shrink-0">{usd(u.cost)}</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                          <div className="h-full bg-slate-700 rounded-full" style={{ width: `${(u.cost / maxUserCost) * 100}%` }} />
                        </div>
                        <p className="text-xs text-slate-400 mt-1">{int(u.calls)} calls</p>
                      </div>
                    ))}
                  </div>
                </Panel>
              </div>

              {/* Per model (compact footnote table) */}
              <Panel title="Cost by model">
                <div className="divide-y divide-slate-100">
                  {data.per_model.map(m => (
                    <div key={m.model} className="px-5 py-3 flex items-center justify-between gap-3">
                      <span className="text-sm font-medium text-slate-800">{m.model}</span>
                      <span className="text-xs text-slate-400">{int(m.calls)} calls</span>
                      <span className="text-sm font-semibold text-slate-900 tabular-nums ml-auto">{usd(m.cost)}</span>
                    </div>
                  ))}
                </div>
              </Panel>
            </>
          )}
        </>
      )}
    </div>
  )
}
