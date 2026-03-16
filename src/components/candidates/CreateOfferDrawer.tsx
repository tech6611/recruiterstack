'use client'

import { useState } from 'react'
import { Gift, X, Loader2, AlertCircle, DollarSign } from 'lucide-react'
import type { OfferStatus } from '@/lib/types/database'

import type { Application, HiringRequest } from '@/lib/types/database'

export const OFFER_STATUS_CONFIG: Record<OfferStatus, { label: string; badge: string }> = {
  draft:            { label: 'Draft',            badge: 'bg-slate-100 text-slate-600' },
  pending_approval: { label: 'Pending Approval', badge: 'bg-amber-100 text-amber-700' },
  approved:         { label: 'Approved',         badge: 'bg-emerald-100 text-emerald-700' },
  sent:             { label: 'Sent',             badge: 'bg-blue-100 text-blue-700' },
  accepted:         { label: 'Accepted ✓',       badge: 'bg-emerald-100 text-emerald-700' },
  declined:         { label: 'Declined',         badge: 'bg-red-100 text-red-700' },
  withdrawn:        { label: 'Withdrawn',        badge: 'bg-slate-100 text-slate-600' },
  expired:          { label: 'Expired',          badge: 'bg-red-100 text-red-600' },
}

type ApplicationWithHiringRequest = Application & {
  hiring_requests: Pick<HiringRequest, 'id' | 'position_title' | 'department' | 'ticket_number'> | null
}

interface CreateOfferDrawerProps {
  activeApps: ApplicationWithHiringRequest[]
  defaultAppId: string
  candidateId: string
  onClose: () => void
  onSaved: () => void
}

export default function CreateOfferDrawer({
  activeApps,
  defaultAppId,
  candidateId,
  onClose,
  onSaved,
}: CreateOfferDrawerProps) {
  const [appId,            setAppId]            = useState(defaultAppId)
  const [baseSalary,       setBaseSalary]       = useState('')
  const [bonus,            setBonus]            = useState('')
  const [equity,           setEquity]           = useState('')
  const [startDate,        setStartDate]        = useState('')
  const [expiryDate,       setExpiryDate]       = useState('')
  const [notes,            setNotes]            = useState('')
  const [offerLetter,      setOfferLetter]      = useState('')
  const [saving,           setSaving]           = useState(false)
  const [error,            setError]            = useState('')

  const selectedApp = activeApps.find(a => a.id === appId)
  const posTitle = selectedApp?.hiring_requests?.position_title ?? 'Position'

  const submit = async () => {
    setSaving(true); setError('')
    const res = await fetch('/api/offers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        application_id:    appId,
        candidate_id:      candidateId,
        hiring_request_id: selectedApp?.hiring_request_id ?? '',
        position_title:    posTitle,
        base_salary:       baseSalary ? Number(baseSalary) : null,
        bonus:             bonus      ? Number(bonus)      : null,
        equity:            equity.trim()      || null,
        start_date:        startDate          || null,
        expiry_date:       expiryDate         || null,
        notes:             notes.trim()       || null,
        offer_letter_text: offerLetter.trim() || null,
      }),
    })
    const json = await res.json()
    setSaving(false)
    if (!res.ok) { setError(json.error ?? 'Failed to create offer'); return }
    onSaved()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative flex h-full w-full max-w-lg flex-col bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 shrink-0">
          <div className="flex items-center gap-2">
            <Gift className="h-5 w-5 text-emerald-500" />
            <h2 className="text-base font-bold text-slate-900">Create Offer</h2>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"><X className="h-4 w-4" /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          {/* Job selector */}
          {activeApps.length > 1 && (
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1.5">For Job</label>
              <select
                value={appId}
                onChange={e => setAppId(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-800 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
              >
                {activeApps.map(a => (
                  <option key={a.id} value={a.id}>{a.hiring_requests?.position_title ?? a.id}</option>
                ))}
              </select>
            </div>
          )}

          {/* Position preview */}
          <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3">
            <p className="text-xs text-emerald-600 font-semibold">{posTitle}</p>
          </div>

          {/* Salary row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1.5">Base Salary (USD)</label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                <input
                  type="number"
                  value={baseSalary}
                  onChange={e => setBaseSalary(e.target.value)}
                  placeholder="120000"
                  className="w-full pl-8 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-800 placeholder-slate-400 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1.5">Bonus (USD)</label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                <input
                  type="number"
                  value={bonus}
                  onChange={e => setBonus(e.target.value)}
                  placeholder="15000"
                  className="w-full pl-8 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-800 placeholder-slate-400 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                />
              </div>
            </div>
          </div>

          {/* Equity */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1.5">Equity</label>
            <input
              value={equity}
              onChange={e => setEquity(e.target.value)}
              placeholder="e.g. 0.05% vested over 4 years"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-800 placeholder-slate-400 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
            />
          </div>

          {/* Start/Expiry dates */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1.5">Start Date</label>
              <input
                type="date"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-800 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1.5">Offer Expiry</label>
              <input
                type="date"
                value={expiryDate}
                onChange={e => setExpiryDate(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-800 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
              />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1.5">Notes</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              placeholder="Special terms, signing bonus, relocation…"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-800 placeholder-slate-400 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 resize-none"
            />
          </div>

          {/* Offer letter */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1.5">Offer Letter (optional)</label>
            <textarea
              value={offerLetter}
              onChange={e => setOfferLetter(e.target.value)}
              rows={5}
              placeholder="Paste or type the full offer letter text…"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-800 placeholder-slate-400 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 resize-none"
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 rounded-xl bg-red-50 border border-red-200 px-3 py-2.5">
              <AlertCircle className="h-4 w-4 text-red-500 shrink-0" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-slate-200 shrink-0">
          <button onClick={onClose} className="rounded-xl px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 border border-slate-200">
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={saving}
            className="flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 transition-colors disabled:opacity-60"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Gift className="h-4 w-4" />}
            Create Offer
          </button>
        </div>
      </div>
    </div>
  )
}
