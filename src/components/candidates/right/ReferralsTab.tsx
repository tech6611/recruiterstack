'use client'
import { useState } from 'react'
import { Plus, Users } from 'lucide-react'
import type { CandidateReferral } from '@/lib/types/database'

interface ReferralsTabProps {
  candidateId: string
  referrals: CandidateReferral[]
  onReferralAdded: (ref: CandidateReferral) => void
}

export default function ReferralsTab({ candidateId, referrals, onReferralAdded }: ReferralsTabProps) {
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    const n = name.trim()
    if (!n) return
    setSaving(true)
    const res = await fetch(`/api/candidates/${candidateId}/referrals`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ referrer_name: n, referrer_email: email.trim() || null, note: note.trim() || null }),
    })
    if (res.ok) {
      const json = await res.json()
      onReferralAdded(json.data)
      setName(''); setEmail(''); setNote(''); setShowForm(false)
    }
    setSaving(false)
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Referrals</h4>
        <button onClick={() => setShowForm(v => !v)} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-50">
          <Plus className="h-3 w-3" /> Add
        </button>
      </div>

      {showForm && (
        <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-3 space-y-2">
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Referrer name *" className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-400" />
          <input value={email} onChange={e => setEmail(e.target.value)} placeholder="Email (optional)" type="email" className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-400" />
          <textarea value={note} onChange={e => setNote(e.target.value)} rows={2} placeholder="Note (optional)" className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm resize-none outline-none focus:border-blue-400" />
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowForm(false)} className="px-3 py-1.5 text-xs text-slate-500 hover:text-slate-700">Cancel</button>
            <button onClick={submit} disabled={saving || !name.trim()} className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
              {saving ? 'Saving…' : 'Add Referral'}
            </button>
          </div>
        </div>
      )}

      {referrals.length === 0 && !showForm ? (
        <div className="flex flex-col items-center py-8 text-center">
          <Users className="h-8 w-8 text-slate-200 mb-2" />
          <p className="text-sm text-slate-400">No referrals recorded</p>
        </div>
      ) : (
        <div className="space-y-2">
          {referrals.map(r => (
            <div key={r.id} className="rounded-xl border border-slate-100 bg-white px-4 py-3">
              <p className="text-sm font-medium text-slate-800">{r.referrer_name}</p>
              {r.referrer_email && <p className="text-xs text-slate-500 mt-0.5">{r.referrer_email}</p>}
              {r.note && <p className="text-xs text-slate-500 mt-1 italic">{r.note}</p>}
              <p className="text-[10px] text-slate-400 mt-1">{new Date(r.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
