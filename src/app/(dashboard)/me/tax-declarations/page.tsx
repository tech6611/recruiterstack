'use client'

import { useAuth } from '@clerk/nextjs'
import { useCallback, useEffect, useState } from 'react'
import { Receipt, AlertTriangle } from 'lucide-react'
import { flags } from '@/lib/flags'
import type { EmployeeTaxDeclaration } from '@/lib/types/database'

function currentFy(): string {
  const d = new Date()
  const y = d.getUTCFullYear()
  const start = d.getUTCMonth() >= 3 ? y : y - 1
  return `${start}-${((start + 1) % 100).toString().padStart(2, '0')}`
}

type Declaration = EmployeeTaxDeclaration

export default function MyTaxDeclarationsPage() {
  const { orgId } = useAuth()
  const [regime, setRegime]         = useState<'new' | 'old' | null>(null)
  const [list, setList]             = useState<Declaration[]>([])
  const [loading, setLoading]       = useState(true)
  const [fy, setFy]                 = useState(currentFy())
  const [draft, setDraft]           = useState<Pick<Declaration, 'rent_paid_annual' | 'section_80c' | 'section_80d' | 'section_80ccd_1b'>>({
    rent_paid_annual: 0,
    section_80c:      0,
    section_80d:      0,
    section_80ccd_1b: 0,
  })
  // v1.1 + v1.2 — open jsonb keys (amounts + 0/1 flags).
  const [otherDraft, setOtherDraft] = useState<{
    '24b': number; '80e': number; '80g': number; '80tta': number
    '80u': number; '80u_severe': number
    '80dd': number; '80dd_severe': number
    '80ddb': number; '80ddb_senior': number
  }>({
    '24b': 0, '80e': 0, '80g': 0, '80tta': 0,
    '80u': 0, '80u_severe': 0,
    '80dd': 0, '80dd_severe': 0,
    '80ddb': 0, '80ddb_senior': 0,
  })
  const [showMore, setShowMore]     = useState(false)
  const [saving, setSaving]         = useState(false)
  const [err, setErr]               = useState<string | null>(null)
  const [savedAt, setSavedAt]       = useState<Date | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    const [rRes, dRes] = await Promise.all([
      fetch('/api/me/tax-regime'),
      fetch('/api/me/tax-declarations'),
    ])
    if (rRes.ok) {
      const j = await rRes.json()
      setRegime(j.data?.tax_regime ?? null)
    }
    if (dRes.ok) {
      const decs = ((await dRes.json()).data ?? []) as Declaration[]
      setList(decs)
      const current = decs.find(d => d.fy === fy)
      if (current) {
        setDraft({
          rent_paid_annual: Number(current.rent_paid_annual),
          section_80c:      Number(current.section_80c),
          section_80d:      Number(current.section_80d),
          section_80ccd_1b: Number(current.section_80ccd_1b),
        })
        const other = (current.other_exemptions ?? {}) as Record<string, number>
        const otherLoaded = {
          '24b':         Number(other['24b']         ?? 0),
          '80e':         Number(other['80e']         ?? 0),
          '80g':         Number(other['80g']         ?? 0),
          '80tta':       Number(other['80tta']       ?? 0),
          '80u':         Number(other['80u']         ?? 0),
          '80u_severe':  Number(other['80u_severe']  ?? 0),
          '80dd':        Number(other['80dd']        ?? 0),
          '80dd_severe': Number(other['80dd_severe'] ?? 0),
          '80ddb':       Number(other['80ddb']       ?? 0),
          '80ddb_senior':Number(other['80ddb_senior']?? 0),
        }
        setOtherDraft(otherLoaded)
        // Auto-expand if any v1.1/v1.2 amount field has a value, so saved data is visible.
        if (Object.values(otherLoaded).some(v => v > 0)) setShowMore(true)
      }
    }
    setLoading(false)
  }, [fy])

  useEffect(() => { if (orgId) refresh() }, [orgId, refresh])

  async function switchRegime(next: 'new' | 'old') {
    const res = await fetch('/api/me/tax-regime', {
      method:  'PUT',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ tax_regime: next }),
    })
    if (!res.ok) { setErr((await res.json()).error ?? 'Failed'); return }
    setRegime(next)
  }

  async function save() {
    setErr(null); setSaving(true)
    try {
      const res = await fetch('/api/me/tax-declarations', {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ fy, ...draft, other_exemptions: otherDraft }),
      })
      const j = await res.json()
      if (!res.ok) { setErr(j.error ?? 'Failed to save'); return }
      setSavedAt(new Date())
      await refresh()
    } finally {
      setSaving(false)
    }
  }

  if (!flags.payroll) return <div className="p-8 text-sm text-slate-500">The Payroll module is not enabled.</div>
  if (loading)        return <div className="p-8 text-sm text-slate-400">Loading…</div>

  return (
    <div className="p-8 max-w-3xl">
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50">
          <Receipt className="h-4 w-4 text-emerald-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Tax declarations</h1>
          <p className="text-sm text-slate-500">Your tax regime + the exemptions your payroll uses each FY.</p>
        </div>
      </div>

      {/* Regime picker */}
      <div className="mb-6 rounded-xl border border-slate-200 bg-white p-5">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">My tax regime</div>
        {regime === null ? (
          <div className="text-sm text-slate-500">You don&apos;t have an employee profile yet — talk to HR.</div>
        ) : (
          <div className="flex items-center gap-3">
            <button
              onClick={() => switchRegime('new')}
              className={`rounded-lg px-3.5 py-2 text-sm font-medium ${regime === 'new' ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
            >
              New regime
            </button>
            <button
              onClick={() => switchRegime('old')}
              className={`rounded-lg px-3.5 py-2 text-sm font-medium ${regime === 'old' ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
            >
              Old regime
            </button>
            <span className="text-xs text-slate-500">
              {regime === 'new'
                ? 'Lower slabs, no HRA / 80C exemptions. Declarations below are ignored.'
                : 'Higher slabs, but you can claim HRA + 80C/80D/80CCD(1B).'}
            </span>
          </div>
        )}
      </div>

      {regime === 'old' && (
        <>
          <div className="mb-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 flex-none" />
            <div>
              These declarations affect your monthly TDS calculation. Keep receipts — your CA will need them at year end.
              RecruiterStack does not file taxes; this is internal payroll computation only.
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-6">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">Declaration</div>
                <div className="text-sm font-medium text-slate-700">FY {fy}</div>
              </div>
              <select value={fy} onChange={e => setFy(e.target.value)} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm">
                <option value={currentFy()}>{currentFy()} (current)</option>
                <option value={prevFy()}>{prevFy()}</option>
              </select>
            </div>

            <div className="space-y-4">
              <DecField label="Annual rent paid" hint="HRA exemption uses this. Set to ₹0 if you don't pay rent (live with parents, own home, etc.)." value={draft.rent_paid_annual} onChange={v => setDraft({ ...draft, rent_paid_annual: v })} />
              <DecField label="Section 80C (₹1.5L cap)" hint="EPF + ELSS + PPF + LIC + ULIP + principal on home loan + 5-yr FD. Your EPF is auto-added by the engine." value={draft.section_80c}      onChange={v => setDraft({ ...draft, section_80c: v })} />
              <DecField label="Section 80D (₹25k self / ₹50k senior)" hint="Health insurance premiums for self / family / parents." value={draft.section_80d}      onChange={v => setDraft({ ...draft, section_80d: v })} />
              <DecField label="Section 80CCD(1B) (₹50k cap)" hint="NPS contribution above the 80C limit. Tier-I only." value={draft.section_80ccd_1b} onChange={v => setDraft({ ...draft, section_80ccd_1b: v })} />
            </div>

            {/* v1.1 — More exemptions (collapsed by default) */}
            <div className="mt-6 border-t border-slate-200 pt-4">
              <button
                onClick={() => setShowMore(s => !s)}
                className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-slate-500 hover:text-slate-700"
              >
                <span>{showMore ? '▼' : '▶'}</span>
                <span>More exemptions ({Object.values(otherDraft).filter(v => v > 0).length} claimed)</span>
              </button>

              {showMore && (
                <div className="mt-4 space-y-4">
                  <DecField
                    label="Section 24(b) — Home loan interest (₹2L cap, self-occupied)"
                    hint="Interest paid on a home loan for a property you live in. Let-out properties follow different rules."
                    value={otherDraft['24b']}
                    onChange={v => setOtherDraft({ ...otherDraft, '24b': v })}
                  />
                  <DecField
                    label="Section 80E — Education loan interest (no cap)"
                    hint="Interest on an education loan for self / spouse / children / legal ward. Available 8 years from start of repayment."
                    value={otherDraft['80e']}
                    onChange={v => setOtherDraft({ ...otherDraft, '80e': v })}
                  />
                  <DecField
                    label="Section 80G — Donations (50% simplification)"
                    hint="Enter total donations to approved charities. RecruiterStack applies a flat 50% deductibility for simplicity — real rule splits 100%/50% donees and caps some at 10% of gross. Reconcile with your CA."
                    value={otherDraft['80g']}
                    onChange={v => setOtherDraft({ ...otherDraft, '80g': v })}
                  />
                  <DecField
                    label="Section 80TTA — Savings account interest (₹10k cap)"
                    hint="Interest from savings accounts in banks / co-op banks / post offices. Under 60 only. Excludes FD interest."
                    value={otherDraft['80tta']}
                    onChange={v => setOtherDraft({ ...otherDraft, '80tta': v })}
                  />

                  {/* ── v1.2: Disability / specified diseases ─────────────── */}
                  <div className="mt-2 border-t border-dashed border-slate-200 pt-4">
                    <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
                      Disability / specified diseases
                    </div>

                    <DecField
                      label={`Section 80U — Self disability (cap ₹${otherDraft['80u_severe'] ? '1,25,000' : '75,000'})`}
                      hint="For an assessee with disability per Form 10-IA. Severity ≥80% raises the cap. Medical certification is your responsibility."
                      value={otherDraft['80u']}
                      onChange={v => setOtherDraft({ ...otherDraft, '80u': v })}
                    />
                    <FlagToggle
                      checked={otherDraft['80u_severe'] > 0}
                      onChange={v => setOtherDraft({ ...otherDraft, '80u_severe': v ? 1 : 0 })}
                      label="Severe disability (≥80%) — raises 80U cap to ₹1,25,000"
                    />

                    <div className="mt-3">
                      <DecField
                        label={`Section 80DD — Disabled dependent maintenance (cap ₹${otherDraft['80dd_severe'] ? '1,25,000' : '75,000'})`}
                        hint="For maintenance / medical of a disabled dependent (spouse / child / parent / sibling). Cap mirrors 80U."
                        value={otherDraft['80dd']}
                        onChange={v => setOtherDraft({ ...otherDraft, '80dd': v })}
                      />
                      <FlagToggle
                        checked={otherDraft['80dd_severe'] > 0}
                        onChange={v => setOtherDraft({ ...otherDraft, '80dd_severe': v ? 1 : 0 })}
                        label="Dependent has severe disability (≥80%) — raises 80DD cap to ₹1,25,000"
                      />
                    </div>

                    <div className="mt-3">
                      <DecField
                        label={`Section 80DDB — Specified diseases (cap ₹${otherDraft['80ddb_senior'] ? '1,00,000' : '40,000'})`}
                        hint="Treatment for specified diseases (cancer, neurological, AIDS, etc.) for self or dependent. Cap rises when patient is 60+."
                        value={otherDraft['80ddb']}
                        onChange={v => setOtherDraft({ ...otherDraft, '80ddb': v })}
                      />
                      <FlagToggle
                        checked={otherDraft['80ddb_senior'] > 0}
                        onChange={v => setOtherDraft({ ...otherDraft, '80ddb_senior': v ? 1 : 0 })}
                        label="Patient is 60+ years — raises 80DDB cap to ₹1,00,000"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {err && <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{err}</div>}

            <div className="mt-6 flex items-center gap-3">
              <button onClick={save} disabled={saving} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50">
                {saving ? 'Saving…' : 'Save declaration'}
              </button>
              {savedAt && <span className="text-xs text-emerald-600">Saved at {savedAt.toLocaleTimeString()}</span>}
            </div>
          </div>
        </>
      )}

      {/* Historic declarations */}
      {list.length > 0 && (
        <div className="mt-8">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">History</div>
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold text-slate-500">
                  <th className="px-4 py-3">FY</th>
                  <th className="px-4 py-3 text-right">Rent</th>
                  <th className="px-4 py-3 text-right">80C</th>
                  <th className="px-4 py-3 text-right">80D</th>
                  <th className="px-4 py-3 text-right">80CCD(1B)</th>
                </tr>
              </thead>
              <tbody>
                {list.map(d => (
                  <tr key={d.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-4 py-3 font-medium text-slate-800">{d.fy}</td>
                    <td className="px-4 py-3 text-right text-slate-700">₹{Number(d.rent_paid_annual).toLocaleString('en-IN')}</td>
                    <td className="px-4 py-3 text-right text-slate-700">₹{Number(d.section_80c).toLocaleString('en-IN')}</td>
                    <td className="px-4 py-3 text-right text-slate-700">₹{Number(d.section_80d).toLocaleString('en-IN')}</td>
                    <td className="px-4 py-3 text-right text-slate-700">₹{Number(d.section_80ccd_1b).toLocaleString('en-IN')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

function prevFy(): string {
  const cur = currentFy()
  const s = parseInt(cur.slice(0, 4))
  return `${s - 1}-${(s % 100).toString().padStart(2, '0')}`
}

function FlagToggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="mt-1 inline-flex cursor-pointer items-center gap-2 text-xs text-slate-600">
      <input
        type="checkbox"
        checked={checked}
        onChange={e => onChange(e.target.checked)}
        className="h-3.5 w-3.5"
      />
      <span>{label}</span>
    </label>
  )
}

function DecField({ label, hint, value, onChange }: { label: string; hint?: string; value: number; onChange: (v: number) => void }) {
  return (
    <div>
      <div className="mb-1 text-sm font-medium text-slate-700">{label}</div>
      {hint && <div className="mb-1 text-xs text-slate-400">{hint}</div>}
      <div className="flex items-center gap-2">
        <span className="text-sm text-slate-500">₹</span>
        <input
          type="number" min="0" step="100"
          value={value}
          onChange={e => onChange(Math.max(0, Number(e.target.value)))}
          className="w-40 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm"
        />
      </div>
    </div>
  )
}
