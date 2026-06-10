'use client'

import { useAuth } from '@clerk/nextjs'
import { useCallback, useEffect, useState } from 'react'
import { Wallet, AlertTriangle } from 'lucide-react'
import { flags } from '@/lib/flags'
import type { PayrollOrgSettings } from '@/lib/types/database'

const STATES = [
  { code: 'KA', name: 'Karnataka' },
  { code: 'MH', name: 'Maharashtra' },
  { code: 'TN', name: 'Tamil Nadu' },
  { code: 'DL', name: 'Delhi' },
  { code: 'HR', name: 'Haryana' },
]

export default function PayrollSettingsPage() {
  const { orgId } = useAuth()
  const [settings, setSettings] = useState<PayrollOrgSettings | null>(null)
  const [loading, setLoading]   = useState(true)
  const [saving, setSaving]     = useState(false)
  const [err, setErr]           = useState<string | null>(null)
  const [savedAt, setSavedAt]   = useState<Date | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/payroll/settings')
    if (res.ok) setSettings(((await res.json()).data) as PayrollOrgSettings)
    setLoading(false)
  }, [])

  useEffect(() => { if (orgId) refresh() }, [orgId, refresh])

  async function save() {
    if (!settings) return
    setErr(null); setSaving(true)
    try {
      const res = await fetch('/api/payroll/settings', {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(settings),
      })
      const j = await res.json()
      if (!res.ok) { setErr(j.error ?? 'Failed to save'); return }
      setSettings(j.data as PayrollOrgSettings)
      setSavedAt(new Date())
    } finally {
      setSaving(false)
    }
  }

  function patch<K extends keyof PayrollOrgSettings>(k: K, v: PayrollOrgSettings[K]) {
    if (!settings) return
    setSettings({ ...settings, [k]: v })
  }

  if (!flags.payroll) return <div className="p-8 text-sm text-slate-500">The Payroll module is not enabled.</div>
  if (loading)        return <div className="p-8 text-sm text-slate-400">Loading…</div>
  if (!settings)      return <div className="p-8 text-sm text-slate-500">Failed to load settings.</div>

  return (
    <div className="p-8 max-w-3xl">
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50">
          <Wallet className="h-4 w-4 text-emerald-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Payroll settings</h1>
          <p className="text-sm text-slate-500">Tax engine, state rules, and salary decomposition used by the compute engine.</p>
        </div>
      </div>

      {/* Disclaimer (country-aware) */}
      <div className="mb-6 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        <AlertTriangle className="mt-0.5 h-4 w-4 flex-none" />
        <div>
          {settings.country_code === 'IN' ? (
            <>RecruiterStack&apos;s India engine implements FY 2026-27 rules at a working-tool accuracy level —
              slabs, 87A rebate, surcharge, cess, PF/ESI/PT. It is <strong>not statutory compliance software</strong>.
              Reconcile every run with your CA before filing.</>
          ) : (
            <>RecruiterStack&apos;s Singapore engine implements Jan 2026 CPF rules + an IRAS YA2026 annual tax
              projection. It is <strong>not statutory compliance software</strong> — Additional Wages (bonus / 13th-month) CPF
              math, age-tier rates above 55, non-resident rates, and personal reliefs are not modelled.
              Reconcile annual filings with your tax advisor.</>
          )}
        </div>
      </div>

      {err && <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{err}</div>}

      <div className="space-y-6 rounded-xl border border-slate-200 bg-white p-6">

        {/* Country */}
        <Field label="Country" hint="Each country uses its own engine. India deducts PF/ESI/PT/TDS monthly; Singapore deducts CPF only (income tax is filed annually with IRAS).">
          <select
            value={settings.country_code}
            onChange={e => patch('country_code', e.target.value as 'IN' | 'SG')}
            className="w-48 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm"
          >
            <option value="IN">India — FY 2026-27</option>
            <option value="SG">Singapore — Jan 2026</option>
          </select>
        </Field>

        {/* India-only settings ────────────────────────────────────── */}
        {settings.country_code === 'IN' && (
          <>
        <Field label="Default state" hint="Used for professional tax. Karnataka raised the PT threshold to ₹25,000/mo in Apr 2025.">
          <select
            value={settings.default_state}
            onChange={e => patch('default_state', e.target.value)}
            className="w-48 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm"
          >
            {STATES.map(s => <option key={s.code} value={s.code}>{s.name}</option>)}
          </select>
        </Field>

        {/* Regime */}
        <Field label="Default regime" hint="Per-employee overrides this in their profile. New regime is the govt default since FY 2023-24.">
          <select
            value={settings.default_tax_regime}
            onChange={e => patch('default_tax_regime', e.target.value as 'new' | 'old')}
            className="w-48 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm"
          >
            <option value="new">New regime</option>
            <option value="old">Old regime</option>
          </select>
        </Field>

        {/* Metro */}
        <Field label="Metro city" hint="Metros (Mumbai/Delhi/Kolkata/Chennai) use 50% HRA on Basic; non-metro uses 40%. Only matters under old regime.">
          <label className="inline-flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={settings.metro} onChange={e => patch('metro', e.target.checked)} />
            Treat workplace as metro
          </label>
        </Field>

        <Divider label="Salary decomposition" />

        <Field label={`Basic % (${pct(settings.basic_pct)})`} hint="Portion of monthly gross that becomes Basic. Industry default ~50%.">
          <RangeInput value={settings.basic_pct} min={0.30} max={0.70} step={0.05} onChange={v => patch('basic_pct', v)} />
        </Field>

        <Field label={`HRA % of Basic — metro (${pct(settings.hra_pct_metro)})`} hint="Industry default 50% in metros.">
          <RangeInput value={settings.hra_pct_metro} min={0.20} max={0.60} step={0.05} onChange={v => patch('hra_pct_metro', v)} />
        </Field>

        <Field label={`HRA % of Basic — non-metro (${pct(settings.hra_pct_non_metro)})`} hint="Industry default 40% in non-metros.">
          <RangeInput value={settings.hra_pct_non_metro} min={0.20} max={0.60} step={0.05} onChange={v => patch('hra_pct_non_metro', v)} />
        </Field>

        <Divider label="Provident Fund (PF)" />

        <Field label={`Employee PF rate (${pct(settings.pf_employee_pct)})`} hint="Statutory minimum 12%. Higher allowed via paragraph 26(6).">
          <RangeInput value={settings.pf_employee_pct} min={0.10} max={0.20} step={0.005} onChange={v => patch('pf_employee_pct', v)} />
        </Field>

        <Field label="PF wage ceiling" hint="If enabled, PF is computed on min(Basic, ceiling) — saves on contribution. Most SMEs leave OFF (full Basic).">
          <label className="inline-flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={settings.pf_wage_ceiling_enabled}
              onChange={e => patch('pf_wage_ceiling_enabled', e.target.checked)}
            />
            Apply ₹{settings.pf_wage_ceiling.toLocaleString('en-IN')} ceiling
          </label>
        </Field>

        <Divider label="ESI" />

        <Field label="ESI threshold (monthly gross)" hint="Employees at/below this pay ESI; above don't. Current statutory threshold ₹21,000.">
          <input
            type="number"
            value={settings.esi_threshold}
            onChange={e => patch('esi_threshold', Number(e.target.value))}
            className="w-32 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm"
          />
        </Field>
          </>
        )}

        {/* Singapore-only info — engine settings are hard-coded so the form
            stays empty; explain what's active. */}
        {settings.country_code === 'SG' && (
          <div className="rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
            <div className="font-semibold">Singapore engine (Jan 2026)</div>
            <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs">
              <li>CPF: employee 20% / employer 17% (up to age 55), Ordinary Wages capped at S$8,000/month.</li>
              <li>No monthly income tax withholding — employees file annually with IRAS.</li>
              <li>The settings below (state / regime / PF / ESI / metro / salary decomposition) are India-specific and ignored under Singapore.</li>
            </ul>
          </div>
        )}

        <Field label="Notes" hint="Free-form; shown on the settings page only, not on payslips.">
          <textarea
            rows={2}
            value={settings.notes ?? ''}
            onChange={e => patch('notes', e.target.value || null)}
            className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm"
          />
        </Field>
      </div>

      <div className="mt-6 flex items-center gap-3">
        <button
          onClick={save}
          disabled={saving}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save settings'}
        </button>
        {savedAt && (
          <span className="text-xs text-emerald-600">Saved at {savedAt.toLocaleTimeString()}</span>
        )}
      </div>
    </div>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-12 items-start gap-3">
      <div className="col-span-4">
        <div className="text-sm font-medium text-slate-700">{label}</div>
        {hint && <div className="mt-0.5 text-xs text-slate-400">{hint}</div>}
      </div>
      <div className="col-span-8">{children}</div>
    </div>
  )
}
function Divider({ label }: { label: string }) {
  return (
    <div className="my-2 flex items-center gap-3">
      <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</div>
      <div className="h-px flex-1 bg-slate-200" />
    </div>
  )
}
function RangeInput({ value, min, max, step, onChange }: { value: number; min: number; max: number; step: number; onChange: (v: number) => void }) {
  return (
    <input
      type="range" min={min} max={max} step={step} value={value}
      onChange={e => onChange(parseFloat(e.target.value))}
      className="w-48"
    />
  )
}
function pct(n: number): string { return `${(n * 100).toFixed(1)}%` }
