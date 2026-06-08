'use client'

import Link from 'next/link'
import { useAuth } from '@clerk/nextjs'
import { use, useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowLeft, CheckCircle2, Trash2, Lock, Sparkles, X } from 'lucide-react'
import { flags } from '@/lib/flags'
import type { EmployeeStatus, Payslip, PayrollRun, PayslipBreakdown } from '@/lib/types/database'

type Totals = { payslip_count: number; gross_total: number; deductions_total: number; net_total: number }
type RunDetail = PayrollRun & { totals: Totals; payslips: PayslipRow[] }
type PayslipRow = Payslip & { employee_name: string | null; employee_email: string | null }
type EmpInfo = { id: string; status: EmployeeStatus; person: { name: string; email: string } | null }

function fmtMoney(n: number, currency: string): string {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: 0 }).format(n)
}

export default function PayrollRunDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { orgId } = useAuth()
  const [run, setRun] = useState<RunDetail | null>(null)
  const [employees, setEmployees] = useState<EmpInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  // Add/edit form (one row at a time keeps the v0 UI honest with admin reality
  // — orgs upload from spreadsheets later; for now we type directly).
  const [empId, setEmpId]               = useState<string>('')
  const [gross, setGross]               = useState<string>('')
  const [deductions, setDeductions]     = useState<string>('0')
  const [notes, setNotes]               = useState<string>('')
  const [saving, setSaving]             = useState(false)

  // Compute (v1) — preview-then-write modal
  const [showCompute, setShowCompute]   = useState(false)
  const [plan, setPlan]                 = useState<ComputePlan | null>(null)
  const [computing, setComputing]       = useState(false)
  const [preserveExisting, setPreserveExisting] = useState(true)

  const refresh = useCallback(async () => {
    setLoading(true)
    const [rRes, eRes] = await Promise.all([
      fetch(`/api/payroll/runs/${id}`),
      fetch('/api/employees?status=active'),
    ])
    if (rRes.ok)  setRun(((await rRes.json()).data) as RunDetail)
    if (eRes.ok)  setEmployees(((await eRes.json()).data ?? []) as EmpInfo[])
    setLoading(false)
  }, [id])

  useEffect(() => { if (orgId) refresh() }, [orgId, refresh])

  const net = useMemo(() => {
    const g = parseFloat(gross || '0') || 0
    const d = parseFloat(deductions || '0') || 0
    return Math.max(0, +(g - d).toFixed(2))
  }, [gross, deductions])

  // Employees who don't yet have a payslip on this run.
  const remainingEmployees = useMemo(() => {
    if (!run) return employees
    const taken = new Set(run.payslips.map(p => p.employee_id))
    return employees.filter(e => !taken.has(e.id))
  }, [run, employees])

  async function addPayslip() {
    if (!empId || !gross) { setErr('Pick an employee and enter gross'); return }
    setErr(null); setSaving(true)
    try {
      const breakdown: PayslipBreakdown = {
        earnings:   [{ label: 'Gross pay',  amount: parseFloat(gross) }],
        deductions: parseFloat(deductions) > 0
          ? [{ label: 'Deductions', amount: parseFloat(deductions) }]
          : [],
      }
      const res = await fetch(`/api/payroll/runs/${id}/payslips`, {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          employee_id:      empId,
          gross:            parseFloat(gross),
          deductions_total: parseFloat(deductions || '0'),
          net,
          breakdown,
          notes:            notes || null,
        }),
      })
      const j = await res.json()
      if (!res.ok) { setErr(j.error ?? 'Failed to save payslip'); return }
      setEmpId(''); setGross(''); setDeductions('0'); setNotes('')
      await refresh()
    } finally {
      setSaving(false)
    }
  }

  async function deletePayslip(payslipId: string) {
    if (!confirm('Delete this payslip?')) return
    const res = await fetch(`/api/payroll/runs/${id}/payslips/${payslipId}`, { method: 'DELETE' })
    if (!res.ok) { setErr((await res.json()).error ?? 'Failed'); return }
    await refresh()
  }

  async function finalize() {
    if (!confirm('Finalize this run? Payslips will be locked for editing.')) return
    const res = await fetch(`/api/payroll/runs/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body:   JSON.stringify({ action: 'finalize' }),
    })
    if (!res.ok) { setErr((await res.json()).error ?? 'Failed'); return }
    await refresh()
  }

  // ── Compute (v1) ─────────────────────────────────────────────────────────
  async function openCompute() {
    setErr(null); setShowCompute(true); setComputing(true); setPlan(null)
    const res = await fetch(`/api/payroll/runs/${id}/compute`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ preview: true }),
    })
    setComputing(false)
    if (!res.ok) { setErr((await res.json()).error ?? 'Compute failed'); setShowCompute(false); return }
    setPlan(((await res.json()).data.plan) as ComputePlan)
  }

  async function commitCompute() {
    setComputing(true)
    const res = await fetch(`/api/payroll/runs/${id}/compute`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ preview: false, preserveExisting }),
    })
    setComputing(false)
    if (!res.ok) { setErr((await res.json()).error ?? 'Compute failed'); return }
    setShowCompute(false); setPlan(null)
    await refresh()
  }

  if (!flags.payroll) return <div className="p-8 text-sm text-slate-500">The Payroll module is not enabled.</div>
  if (loading) return <div className="p-8 text-sm text-slate-400">Loading…</div>
  if (!run)    return <div className="p-8 text-sm text-slate-500">Payroll run not found.</div>

  const locked = run.status === 'finalized'

  return (
    <div className="p-8">
      <Link href="/payroll/runs" className="mb-4 inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-700">
        <ArrowLeft className="h-3.5 w-3.5" /> All runs
      </Link>

      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            {new Date(run.period_start + 'T00:00:00Z').toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })}
          </h1>
          <p className="text-sm text-slate-500">
            {run.period_start} → {run.period_end}
            {run.pay_date && <> · pay date {run.pay_date}</>}
            <> · {run.currency}</>
          </p>
        </div>
        <div className="flex items-center gap-3">
          {!locked && (
            <button
              onClick={openCompute}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              title="Generate draft payslips from current compensation + tax rules"
            >
              <Sparkles className="h-4 w-4 text-emerald-600" /> Generate from employees
            </button>
          )}
          {locked ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 ring-1 ring-emerald-200">
              <Lock className="h-3 w-3" /> Finalized
            </span>
          ) : (
            <button
              onClick={finalize}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
              disabled={run.payslips.length === 0}
            >
              <CheckCircle2 className="h-4 w-4" /> Finalize run
            </button>
          )}
        </div>
      </div>

      {/* Totals strip */}
      <div className="mb-6 grid grid-cols-4 gap-3">
        <Stat label="Payslips" value={String(run.totals.payslip_count)} />
        <Stat label="Gross"       value={fmtMoney(run.totals.gross_total,      run.currency)} />
        <Stat label="Deductions"  value={fmtMoney(run.totals.deductions_total, run.currency)} />
        <Stat label="Net"         value={fmtMoney(run.totals.net_total,        run.currency)} bold />
      </div>

      {err && <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{err}</div>}

      {/* Add-payslip form (hidden when locked) */}
      {!locked && (
        <div className="mb-6 rounded-xl border border-slate-200 bg-white p-4">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Add payslip</div>
          <div className="grid grid-cols-12 gap-2">
            <select
              value={empId}
              onChange={e => setEmpId(e.target.value)}
              className="col-span-4 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm"
            >
              <option value="">Select employee…</option>
              {remainingEmployees.map(e => (
                <option key={e.id} value={e.id}>{e.person?.name ?? '(unknown)'} {e.person?.email ? `· ${e.person.email}` : ''}</option>
              ))}
            </select>
            <input
              type="number" step="0.01" min="0" placeholder="Gross"
              value={gross} onChange={e => setGross(e.target.value)}
              className="col-span-2 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm"
            />
            <input
              type="number" step="0.01" min="0" placeholder="Deductions"
              value={deductions} onChange={e => setDeductions(e.target.value)}
              className="col-span-2 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm"
            />
            <div className="col-span-2 flex items-center rounded-lg border border-slate-100 bg-slate-50 px-2.5 py-2 text-sm text-slate-600">
              Net {fmtMoney(net, run.currency)}
            </div>
            <button
              onClick={addPayslip}
              disabled={saving || !empId || !gross}
              className="col-span-2 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Add'}
            </button>
          </div>
          <input
            placeholder="Notes (optional)"
            value={notes}
            onChange={e => setNotes(e.target.value)}
            className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm"
          />
        </div>
      )}

      {/* Payslip table */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold text-slate-500">
              <th className="px-4 py-3">Employee</th>
              <th className="px-4 py-3 text-right">Gross</th>
              <th className="px-4 py-3 text-right">Deductions</th>
              <th className="px-4 py-3 text-right">Net</th>
              <th className="px-4 py-3">Notes</th>
              {!locked && <th className="px-4 py-3"></th>}
            </tr>
          </thead>
          <tbody>
            {run.payslips.length === 0 ? (
              <tr><td colSpan={locked ? 5 : 6} className="px-4 py-10 text-center text-slate-400">No payslips yet — add one above.</td></tr>
            ) : run.payslips.map(p => (
              <tr key={p.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                <td className="px-4 py-3">
                  <div className="font-medium text-slate-900">{p.employee_name ?? '(unknown)'}</div>
                  <div className="text-xs text-slate-400">{p.employee_email ?? ''}</div>
                </td>
                <td className="px-4 py-3 text-right text-slate-700">{fmtMoney(Number(p.gross),            run.currency)}</td>
                <td className="px-4 py-3 text-right text-slate-700">{fmtMoney(Number(p.deductions_total), run.currency)}</td>
                <td className="px-4 py-3 text-right font-medium text-slate-900">{fmtMoney(Number(p.net),  run.currency)}</td>
                <td className="px-4 py-3 text-slate-500">{p.notes ?? ''}</td>
                {!locked && (
                  <td className="px-4 py-3">
                    <button
                      onClick={() => deletePayslip(p.id)}
                      className="text-slate-400 hover:text-rose-600"
                      title="Delete payslip"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Compute preview modal ─────────────────────────────────────── */}
      {showCompute && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="max-h-[85vh] w-full max-w-3xl overflow-hidden rounded-xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-emerald-600" />
                <h2 className="text-base font-semibold text-slate-900">Generate from employees — preview</h2>
              </div>
              <button onClick={() => setShowCompute(false)} className="text-slate-400 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="overflow-y-auto px-5 py-4" style={{ maxHeight: 'calc(85vh - 130px)' }}>
              {computing && <div className="py-8 text-center text-sm text-slate-500">Computing…</div>}
              {!computing && plan && (
                <>
                  <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    <strong>{plan.engine}</strong> · FY {plan.fy} · regime default <strong>{plan.regime_default}</strong>.
                    These figures are a working-tool estimate, not statutory compliance. Reconcile with your CA.
                  </div>
                  <div className="mb-3 text-sm text-slate-600">
                    {plan.scored} employee{plan.scored === 1 ? '' : 's'} computed
                    {plan.skipped > 0 && <> · {plan.skipped} skipped (no comp record)</>}
                  </div>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold text-slate-500">
                        <th className="px-3 py-2">Employee</th>
                        <th className="px-3 py-2 text-right">Gross</th>
                        <th className="px-3 py-2 text-right">Deductions</th>
                        <th className="px-3 py-2 text-right">Net</th>
                        <th className="px-3 py-2">LWP</th>
                      </tr>
                    </thead>
                    <tbody>
                      {plan.plans.map(p => (
                        <tr key={p.employee_id} className="border-b border-slate-100 last:border-0">
                          <td className="px-3 py-2">
                            <div className="font-medium text-slate-900">{p.employee_name ?? '(unknown)'}</div>
                            <div className="text-xs text-slate-400">{p.employee_email ?? ''}</div>
                            {p.skip_reason && (
                              <div className="mt-0.5 text-xs text-rose-600">Skipped: {p.error}</div>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right text-slate-700">
                            {p.computed ? fmtMoney(p.computed.gross, run.currency) : '—'}
                          </td>
                          <td className="px-3 py-2 text-right text-slate-700">
                            {p.computed ? fmtMoney(p.computed.deductionsTotal, run.currency) : '—'}
                          </td>
                          <td className="px-3 py-2 text-right font-medium text-slate-900">
                            {p.computed ? fmtMoney(p.computed.net, run.currency) : '—'}
                          </td>
                          <td className="px-3 py-2 text-xs text-slate-500">
                            {(p.lwp_days ?? 0) > 0 ? `${p.lwp_days} day(s)` : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}
            </div>
            <div className="flex items-center justify-between border-t border-slate-200 px-5 py-4">
              <label className="inline-flex items-center gap-2 text-xs text-slate-600">
                <input
                  type="checkbox"
                  checked={!preserveExisting}
                  onChange={e => setPreserveExisting(!e.target.checked)}
                />
                Overwrite existing payslips
              </label>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowCompute(false)}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  onClick={commitCompute}
                  disabled={!plan || computing || (plan?.scored ?? 0) === 0}
                  className="rounded-lg bg-slate-900 px-3.5 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
                >
                  {computing ? 'Writing…' : 'Write payslips'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Compute plan shape (from /api/payroll/runs/[id]/compute) ───────────────
interface ComputePlanRow {
  employee_id:    string
  employee_name:  string | null
  employee_email: string | null
  skip_reason?:   string
  error?:         string
  lwp_days?:      number
  computed?: {
    gross:           number
    deductionsTotal: number
    net:             number
  }
}
interface ComputePlan {
  run_id:        string
  period_start:  string
  period_end:    string
  period_days:   number
  fy:            string
  engine:        string
  regime_default: 'new' | 'old'
  plans:         ComputePlanRow[]
  scored:        number
  skipped:       number
}

function Stat({ label, value, bold = false }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
      <div className="text-xs font-medium text-slate-500">{label}</div>
      <div className={`mt-1 ${bold ? 'text-xl font-bold text-emerald-700' : 'text-lg font-semibold text-slate-900'}`}>{value}</div>
    </div>
  )
}
