'use client'

import Link from 'next/link'
import { useAuth } from '@clerk/nextjs'
import { useCallback, useEffect, useState } from 'react'
import { Wallet } from 'lucide-react'
import { flags } from '@/lib/flags'
import type { Payslip } from '@/lib/types/database'

type Row = Payslip & {
  run: { period_start: string; period_end: string; pay_date: string | null; currency: string; status: string }
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

export default function MyPayslipsPage() {
  const { orgId } = useAuth()
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/me/payslips')
    if (res.ok) setRows(((await res.json()).data ?? []) as Row[])
    setLoading(false)
  }, [])

  useEffect(() => { if (orgId) refresh() }, [orgId, refresh])

  if (!flags.payroll) return <div className="p-8 text-sm text-slate-500">The Payroll module is not enabled.</div>

  return (
    <div className="p-8">
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50">
          <Wallet className="h-4 w-4 text-emerald-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">My payslips</h1>
          <p className="text-sm text-slate-500">Pay history across runs. Drafts are pre-finalize, finalized are locked.</p>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold text-slate-500">
              <th className="px-4 py-3">Period</th>
              <th className="px-4 py-3">Pay date</th>
              <th className="px-4 py-3 text-right">Gross</th>
              <th className="px-4 py-3 text-right">Deductions</th>
              <th className="px-4 py-3 text-right">Net</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-400">Loading…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-400">No payslips yet.</td></tr>
            ) : (
              rows.map(p => (
                <tr key={p.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <Link href={`/me/payslips/${p.id}`} className="font-medium text-slate-900 hover:text-emerald-700">
                      {fmtPeriod(p.run.period_start, p.run.period_end)}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-slate-500">{p.run.pay_date ?? '—'}</td>
                  <td className="px-4 py-3 text-right text-slate-700">{fmtMoney(Number(p.gross),            p.run.currency)}</td>
                  <td className="px-4 py-3 text-right text-slate-700">{fmtMoney(Number(p.deductions_total), p.run.currency)}</td>
                  <td className="px-4 py-3 text-right font-medium text-slate-900">{fmtMoney(Number(p.net),  p.run.currency)}</td>
                  <td className="px-4 py-3 text-slate-500">{p.run.status}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
