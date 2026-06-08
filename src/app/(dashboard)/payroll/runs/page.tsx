'use client'

import Link from 'next/link'
import { useAuth } from '@clerk/nextjs'
import { useCallback, useEffect, useState } from 'react'
import { Wallet, Plus } from 'lucide-react'
import { flags } from '@/lib/flags'
import type { PayrollRun } from '@/lib/types/database'

type Totals = { payslip_count: number; gross_total: number; deductions_total: number; net_total: number }
type Row = PayrollRun & { totals: Totals }

// Default to "this calendar month" — orgs almost always run monthly payroll.
function thisMonth(): { period_start: string; period_end: string } {
  const now = new Date()
  const y = now.getUTCFullYear(), m = now.getUTCMonth()
  const start = new Date(Date.UTC(y, m, 1))
  const end   = new Date(Date.UTC(y, m + 1, 0))
  const fmt = (d: Date) => d.toISOString().slice(0, 10)
  return { period_start: fmt(start), period_end: fmt(end) }
}

const STATUS_BADGE: Record<PayrollRun['status'], string> = {
  draft:     'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
  finalized: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
}

function fmtMoney(n: number, currency: string): string {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: 0 }).format(n)
}
function fmtPeriod(start: string, end: string): string {
  const s = new Date(start + 'T00:00:00Z')
  const e = new Date(end + 'T00:00:00Z')
  const sm = s.toLocaleString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
  const em = e.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
  return `${sm} – ${em}`
}

export default function PayrollRunsPage() {
  const { orgId } = useAuth()
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/payroll/runs')
    if (res.ok) setRows(((await res.json()).data ?? []) as Row[])
    setLoading(false)
  }, [])

  useEffect(() => { if (orgId) refresh() }, [orgId, refresh])

  async function createRun() {
    setErr(null); setCreating(true)
    try {
      const { period_start, period_end } = thisMonth()
      const res = await fetch('/api/payroll/runs', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ period_start, period_end, pay_date: period_end }),
      })
      const j = await res.json()
      if (!res.ok) { setErr(j.error ?? 'Failed to create run'); return }
      window.location.href = `/payroll/runs/${j.data.id}`
    } finally {
      setCreating(false)
    }
  }

  if (!flags.payroll) return <div className="p-8 text-sm text-slate-500">The Payroll module is not enabled.</div>

  return (
    <div className="p-8">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50">
            <Wallet className="h-4 w-4 text-emerald-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Payroll runs</h1>
            <p className="text-sm text-slate-500">A ledger of what each employee was paid in each pay period.</p>
          </div>
        </div>
        <button
          onClick={createRun}
          disabled={creating}
          className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3.5 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
        >
          <Plus className="h-4 w-4" />
          {creating ? 'Creating…' : 'New run (this month)'}
        </button>
      </div>

      {err && <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{err}</div>}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold text-slate-500">
              <th className="px-4 py-3">Period</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Payslips</th>
              <th className="px-4 py-3 text-right">Gross</th>
              <th className="px-4 py-3 text-right">Net</th>
              <th className="px-4 py-3">Pay date</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-400">Loading…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-400">No payroll runs yet — create your first.</td></tr>
            ) : (
              rows.map(r => (
                <tr key={r.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <Link href={`/payroll/runs/${r.id}`} className="font-medium text-slate-900 hover:text-emerald-700">
                      {fmtPeriod(r.period_start, r.period_end)}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[r.status]}`}>{r.status}</span>
                  </td>
                  <td className="px-4 py-3 text-right text-slate-700">{r.totals.payslip_count}</td>
                  <td className="px-4 py-3 text-right text-slate-700">{fmtMoney(r.totals.gross_total, r.currency)}</td>
                  <td className="px-4 py-3 text-right font-medium text-slate-900">{fmtMoney(r.totals.net_total, r.currency)}</td>
                  <td className="px-4 py-3 text-slate-500">{r.pay_date ?? '—'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
