'use client'

import Link from 'next/link'
import { useAuth } from '@clerk/nextjs'
import { use, useCallback, useEffect, useState } from 'react'
import { ArrowLeft, Wallet, Download } from 'lucide-react'
import { flags } from '@/lib/flags'
import type { Payslip, PayslipBreakdown } from '@/lib/types/database'

type Detail = Payslip & {
  run: { period_start: string; period_end: string; pay_date: string | null; currency: string; status: string }
}

function fmtMoney(n: number, currency: string): string {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: 2 }).format(n)
}

export default function MyPayslipDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { orgId } = useAuth()
  const [data, setData] = useState<Detail | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  const refresh = useCallback(async () => {
    setLoading(true)
    const res = await fetch(`/api/me/payslips/${id}`)
    if (res.status === 404) { setNotFound(true); setLoading(false); return }
    if (res.ok) setData(((await res.json()).data) as Detail)
    setLoading(false)
  }, [id])

  useEffect(() => { if (orgId) refresh() }, [orgId, refresh])

  if (!flags.payroll) return <div className="p-8 text-sm text-slate-500">The Payroll module is not enabled.</div>
  if (loading)        return <div className="p-8 text-sm text-slate-400">Loading…</div>
  if (notFound)       return <div className="p-8 text-sm text-slate-500">Payslip not found.</div>
  if (!data)          return null

  const breakdown = (data.breakdown ?? {}) as PayslipBreakdown
  const earnings   = breakdown.earnings   ?? []
  const deductions = breakdown.deductions ?? []

  return (
    <div className="p-8 max-w-3xl">
      <Link href="/me/payslips" className="mb-4 inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-700">
        <ArrowLeft className="h-3.5 w-3.5" /> My payslips
      </Link>

      <div className="mb-6 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50">
            <Wallet className="h-4 w-4 text-emerald-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              {new Date(data.run.period_start + 'T00:00:00Z').toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })}
            </h1>
            <p className="text-sm text-slate-500">
              {data.run.period_start} → {data.run.period_end}
              {data.run.pay_date && <> · paid {data.run.pay_date}</>}
            </p>
          </div>
        </div>
        <button
          onClick={() => window.print()}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          <Download className="h-4 w-4" /> Print / Save
        </button>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <div className="mb-6">
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">Paid to</div>
          <div className="mt-1 font-medium text-slate-900">{data.employee_name_snapshot ?? '—'}</div>
          <div className="text-sm text-slate-500">{data.employee_email_snapshot ?? ''}</div>
        </div>

        {/* Earnings */}
        <Section title="Earnings">
          {earnings.length === 0
            ? <Row label="Gross pay" amount={Number(data.gross)} currency={data.run.currency} />
            : earnings.map((l, i) => <Row key={i} label={l.label} amount={l.amount} currency={data.run.currency} />)
          }
          <Row label="Gross total" amount={Number(data.gross)} currency={data.run.currency} bold />
        </Section>

        {/* Deductions */}
        <Section title="Deductions">
          {deductions.length === 0 && Number(data.deductions_total) === 0
            ? <div className="px-4 py-3 text-sm text-slate-400">No deductions.</div>
            : deductions.length === 0
              ? <Row label="Deductions" amount={Number(data.deductions_total)} currency={data.run.currency} />
              : deductions.map((l, i) => <Row key={i} label={l.label} amount={l.amount} currency={data.run.currency} />)
          }
          <Row label="Deductions total" amount={Number(data.deductions_total)} currency={data.run.currency} bold />
        </Section>

        {/* Net */}
        <div className="mt-4 rounded-lg bg-emerald-50 px-4 py-3 ring-1 ring-emerald-200">
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium text-emerald-900">Net pay</div>
            <div className="text-xl font-bold text-emerald-700">{fmtMoney(Number(data.net), data.run.currency)}</div>
          </div>
        </div>

        {data.notes && (
          <div className="mt-4 text-sm text-slate-600">
            <span className="font-medium text-slate-700">Notes:</span> {data.notes}
          </div>
        )}
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <div className="border-b border-slate-200 pb-1 text-xs font-semibold uppercase tracking-wider text-slate-500">{title}</div>
      <div className="divide-y divide-slate-100">{children}</div>
    </div>
  )
}
function Row({ label, amount, currency, bold = false }: { label: string; amount: number; currency: string; bold?: boolean }) {
  return (
    <div className={`flex items-center justify-between px-4 py-2 text-sm ${bold ? 'font-semibold text-slate-900' : 'text-slate-700'}`}>
      <span>{label}</span>
      <span>{new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: 2 }).format(amount)}</span>
    </div>
  )
}
