'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useParams } from 'next/navigation'
import { Loader2, Check, AlertCircle, PhoneCall } from 'lucide-react'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Slot { start: string; end: string }  // ISO UTC

interface PhoneScreenPayload {
  token: string
  status: string
  candidate_name: string | null
  position_title: string | null
  expires_at: string | null
  preferred_slots: Slot[]
  timezone: string | null
}

// ── Slot generation (candidate-local, no calendar check) ───────────────────────
// An AI places the call, so there's nothing to check availability against — we
// just offer upcoming business-hours windows and let the candidate tick the ones
// that suit them. `new Date(y, m, d, h)` builds times in the browser's local
// timezone (which IS the candidate's), so toISOString() gives the correct UTC.

const BUSINESS_DAYS = 10
const START_HOUR = 9    // 9:00 first window start
const END_HOUR = 18     // 18:00 last window start (→ 19:00 end)

function upcomingWindows(): Slot[] {
  const out: Slot[] = []
  const now = new Date()
  let collected = 0
  for (let offset = 1; offset <= 21 && collected < BUSINESS_DAYS; offset++) {
    const day = new Date(now)
    day.setDate(now.getDate() + offset)
    const dow = day.getDay()
    if (dow === 0 || dow === 6) continue  // skip Sat/Sun
    collected++
    for (let h = START_HOUR; h <= END_HOUR; h++) {
      const start = new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, 0, 0, 0)
      const end   = new Date(day.getFullYear(), day.getMonth(), day.getDate(), h + 1, 0, 0, 0)
      out.push({ start: start.toISOString(), end: end.toISOString() })
    }
  }
  return out
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function PhoneScreenPage() {
  const params = useParams()
  const token  = params.token as string

  const [loading,    setLoading]    = useState(true)
  const [error,      setError]      = useState<string | null>(null)
  const [payload,    setPayload]    = useState<PhoneScreenPayload | null>(null)
  const [selected,   setSelected]   = useState<Set<string>>(new Set())  // chosen slot start ISOs
  const [submitting, setSubmitting] = useState(false)
  const [submitted,  setSubmitted]  = useState(false)

  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
  const tzLabel = tz.replace(/_/g, ' ')

  const windows = useMemo(() => upcomingWindows(), [])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/phone-screen/${token}`, { cache: 'no-store' })
      const json = await res.json()
      if (!res.ok) { setError(json.error ?? 'Failed to load this link'); return }
      setPayload(json)
      // Pre-select any windows the candidate already submitted.
      if (Array.isArray(json.preferred_slots) && json.preferred_slots.length > 0) {
        setSelected(new Set(json.preferred_slots.map((s: Slot) => s.start)))
      }
    } catch {
      setError('Network error. Please refresh and try again.')
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => { load() }, [load])

  // Group windows by the candidate's local day.
  const groups = useMemo(() => {
    const dayFmt  = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'long', month: 'short', day: 'numeric' })
    const timeFmt = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit' })
    const map = new Map<string, { label: string; items: { iso: string; label: string }[] }>()
    for (const w of windows) {
      const d = new Date(w.start)
      const dayKey = dayFmt.format(d)
      if (!map.has(dayKey)) map.set(dayKey, { label: dayKey, items: [] })
      map.get(dayKey)!.items.push({ iso: w.start, label: timeFmt.format(d) })
    }
    return Array.from(map.values())
  }, [windows, tz])

  const toggle = (iso: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(iso)) next.delete(iso)
      else next.add(iso)
      return next
    })
  }

  const handleSubmit = async () => {
    if (selected.size === 0) return
    setSubmitting(true)
    try {
      const slots = windows.filter(w => selected.has(w.start))
      const res = await fetch(`/api/phone-screen/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slots, timezone: tz }),
      })
      const json = await res.json()
      if (!res.ok) { alert(json.error ?? 'Failed to submit. Please try again.'); return }
      setSubmitted(true)
    } catch {
      alert('Network error. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  // ── Loading ──────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    )
  }

  // ── Error ────────────────────────────────────────────────────────────────────
  if (error) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm max-w-md w-full p-8 text-center">
          <div className="h-12 w-12 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="h-6 w-6 text-red-500" />
          </div>
          <h2 className="text-base font-bold text-slate-900 mb-2">Link unavailable</h2>
          <p className="text-sm text-slate-500">{error}</p>
        </div>
      </div>
    )
  }

  // ── Submitted ────────────────────────────────────────────────────────────────
  if (submitted) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm max-w-md w-full p-8 text-center">
          <div className="h-14 w-14 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
            <Check className="h-7 w-7 text-emerald-600" />
          </div>
          <h2 className="text-lg font-bold text-slate-900 mb-1">Thanks — we&apos;ve got your times!</h2>
          <p className="text-sm text-slate-500 mb-1">
            You picked {selected.size} time{selected.size === 1 ? '' : 's'}. We&apos;ll call you during one of them for a quick phone screen.
          </p>
          <p className="text-xs text-slate-400 mt-4">You can close this page.</p>
        </div>
      </div>
    )
  }

  const firstName = payload?.candidate_name?.split(' ')[0] ?? null

  // ── Main ─────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-lg bg-emerald-600 flex items-center justify-center">
            <span className="text-white text-[11px] font-bold">RS</span>
          </div>
          <span className="text-sm font-semibold text-slate-700">RecruiterStack</span>
        </div>
        {payload?.expires_at && (
          <span className="text-[11px] text-slate-400">
            Link expires {new Date(payload.expires_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </span>
        )}
      </div>

      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 mb-6">
          <div className="flex items-center gap-3 mb-3">
            <div className="h-10 w-10 rounded-xl bg-emerald-50 flex items-center justify-center shrink-0">
              <PhoneCall className="h-5 w-5 text-emerald-600" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-900">
                {firstName ? `Hi ${firstName}, when can we call you?` : 'When can we call you?'}
              </h1>
              {payload?.position_title && <p className="text-sm text-slate-500">{payload.position_title}</p>}
            </div>
          </div>
          <p className="text-sm text-slate-600">
            Your application is moving forward. We&apos;d love to do a quick AI phone screen — just
            pick every time window that works for you below, and we&apos;ll call you during one of them.
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/60">
            <h2 className="text-sm font-semibold text-slate-700">Pick your preferred times</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Choose as many as you like. Times are shown in your timezone ({tzLabel}).
            </p>
          </div>

          <div className="divide-y divide-slate-100">
            {groups.map(group => (
              <div key={group.label} className="px-5 py-4">
                <p className="text-xs font-semibold text-slate-600 mb-2.5">{group.label}</p>
                <div className="flex flex-wrap gap-2">
                  {group.items.map(item => {
                    const isSel = selected.has(item.iso)
                    return (
                      <button
                        key={item.iso}
                        onClick={() => toggle(item.iso)}
                        className={`rounded-lg border px-3.5 py-2 text-sm font-medium transition-colors ${
                          isSel
                            ? 'border-emerald-500 bg-emerald-600 text-white'
                            : 'border-slate-200 bg-white text-slate-700 hover:border-emerald-300 hover:bg-emerald-50'
                        }`}
                      >
                        {item.label}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Submit bar */}
        {selected.size > 0 && (
          <div className="sticky bottom-4 mt-4">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-lg p-4 flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="text-[11px] text-slate-400 uppercase tracking-wide font-semibold">Selected</p>
                <p className="text-sm font-semibold text-slate-800">{selected.size} time{selected.size === 1 ? '' : 's'}</p>
              </div>
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 text-sm font-semibold disabled:opacity-60 transition-colors shrink-0"
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                {submitting ? 'Submitting…' : 'Submit my times'}
              </button>
            </div>
          </div>
        )}

        <p className="text-center text-xs text-slate-400 mt-6">Powered by RecruiterStack</p>
      </div>
    </div>
  )
}
