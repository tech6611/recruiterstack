'use client'

import { useState, useEffect } from 'react'
import { BellRing, Check, Loader2 } from 'lucide-react'

// Offered intervals (minutes before the interview). Longest first.
const OPTIONS: { min: number; label: string }[] = [
  { min: 10080, label: '1 week' },
  { min: 4320,  label: '3 days' },
  { min: 1440,  label: '24 hours' },
  { min: 240,   label: '4 hours' },
  { min: 60,    label: '1 hour' },
  { min: 30,    label: '30 minutes' },
]

export default function InterviewRemindersCard() {
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [loading, setLoading]   = useState(true)
  const [saving, setSaving]     = useState(false)
  const [saved, setSaved]       = useState(false)
  const [error, setError]       = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/scheduling-settings')
      .then(r => r.json())
      .then(d => { if (!cancelled) setSelected(new Set((d.reminder_lead_minutes ?? []) as number[])) })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  const toggle = (min: number) => {
    setSaved(false)
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(min)) next.delete(min); else next.add(min)
      return next
    })
  }

  const save = async () => {
    setSaving(true); setError(null)
    try {
      const res = await fetch('/api/scheduling-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reminder_lead_minutes: Array.from(selected) }),
      })
      if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.error || 'Failed to save') }
      const d = await res.json()
      setSelected(new Set((d.reminder_lead_minutes ?? []) as number[]))
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div id="interview-reminders" className="rounded-2xl border border-slate-200 bg-white shadow-sm p-6 space-y-4 scroll-mt-24">
      <div className="flex items-center gap-2.5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-50">
          <BellRing className="h-4 w-4 text-slate-600" />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-slate-800">Interview reminders</h2>
          <p className="text-xs text-slate-400">
            Automated reminders sent to the candidate &amp; interviewer before each interview. Uncheck all to turn off.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="py-4 flex justify-center"><Loader2 className="h-4 w-4 animate-spin text-slate-400" /></div>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            {OPTIONS.map(o => {
              const active = selected.has(o.min)
              return (
                <button
                  key={o.min}
                  type="button"
                  onClick={() => toggle(o.min)}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors ${
                    active
                      ? 'bg-slate-800 border-slate-800 text-white'
                      : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  {active && <Check className="h-3 w-3" />}
                  {o.label} before
                </button>
              )
            })}
          </div>

          {selected.size === 0 && (
            <p className="text-xs text-amber-600">No reminders will be sent for interviews.</p>
          )}
          {error && <p className="text-xs text-red-500">{error}</p>}

          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-xl bg-[#221b14] px-4 py-2 text-sm font-semibold text-white hover:bg-[#33271b] disabled:opacity-60 transition-colors"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : saved ? <Check className="h-4 w-4" /> : null}
            {saving ? 'Saving…' : saved ? 'Saved!' : 'Save reminders'}
          </button>
        </>
      )}
    </div>
  )
}
