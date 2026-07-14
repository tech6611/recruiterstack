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
// give the candidate a proper calendar: upcoming days starting today, and any
// 30-minute slot across the day (not just business hours). `new Date(y, m, d, h)`
// builds times in the browser's local timezone (which IS the candidate's), so
// toISOString() gives the correct UTC.

const DAYS_AHEAD    = 14   // today + next 13 days
const SLOT_MINUTES  = 30   // 30-minute selectable windows
const DAY_START_HOUR = 7   // earliest slot start (7:00 AM)
const DAY_END_HOUR   = 22  // slots run up to (but not past) 22:00

interface DaySlots { key: string; date: Date; slots: Slot[] }

// Build the selectable days. On today, slots already in the past are dropped, so
// a candidate opening the link late in the day just sees tomorrow onward.
function upcomingDays(): DaySlots[] {
  const out: DaySlots[] = []
  const now = new Date()
  for (let offset = 0; offset < DAYS_AHEAD; offset++) {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset)
    const slots: Slot[] = []
    for (let h = DAY_START_HOUR; h < DAY_END_HOUR; h++) {
      for (let m = 0; m < 60; m += SLOT_MINUTES) {
        const start = new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, m, 0, 0)
        if (start.getTime() <= now.getTime()) continue  // skip past times today
        const end = new Date(start.getTime() + SLOT_MINUTES * 60_000)
        slots.push({ start: start.toISOString(), end: end.toISOString() })
      }
    }
    if (slots.length > 0) out.push({ key: `${day.getFullYear()}-${day.getMonth()}-${day.getDate()}`, date: day, slots })
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
  const [activeDay,  setActiveDay]  = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitted,  setSubmitted]  = useState(false)

  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
  const tzLabel = tz.replace(/_/g, ' ')

  const days = useMemo(() => upcomingDays(), [])
  const allSlots = useMemo(() => days.flatMap(d => d.slots), [days])

  // Default the calendar to the first available day.
  useEffect(() => {
    if (!activeDay && days.length > 0) setActiveDay(days[0].key)
  }, [days, activeDay])

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

  const dayTabFmt = useMemo(
    () => new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short' }),
    [tz],
  )
  const dayNumFmt = useMemo(
    () => new Intl.DateTimeFormat('en-US', { timeZone: tz, month: 'short', day: 'numeric' }),
    [tz],
  )
  const timeFmt = useMemo(
    () => new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit' }),
    [tz],
  )

  // Count selected slots per day, for the little badge on each day tab.
  const selectedPerDay = useMemo(() => {
    const counts = new Map<string, number>()
    for (const d of days) {
      const n = d.slots.filter(s => selected.has(s.start)).length
      if (n > 0) counts.set(d.key, n)
    }
    return counts
  }, [days, selected])

  const activeSlots = useMemo(
    () => days.find(d => d.key === activeDay)?.slots ?? [],
    [days, activeDay],
  )

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
      const slots = allSlots.filter(w => selected.has(w.start))
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
            Your application is moving forward. We&apos;d love to do a quick AI phone screen — pick a
            day, then tap every time that works for you, and we&apos;ll call you during one of them.
          </p>
        </div>

        {days.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 text-center">
            <p className="text-sm text-slate-500">No times are available right now. Please contact your recruiter.</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/60">
              <h2 className="text-sm font-semibold text-slate-700">Pick your preferred times</h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Choose as many as you like. Times are shown in your timezone ({tzLabel}).
              </p>
            </div>

            {/* Day selector — a scrollable row of upcoming days, starting today. */}
            <div className="flex gap-2 overflow-x-auto px-5 py-3 border-b border-slate-100">
              {days.map(d => {
                const isActive = d.key === activeDay
                const count = selectedPerDay.get(d.key) ?? 0
                return (
                  <button
                    key={d.key}
                    onClick={() => setActiveDay(d.key)}
                    className={`relative shrink-0 rounded-xl border px-3 py-2 text-center transition-colors ${
                      isActive
                        ? 'border-emerald-500 bg-emerald-50'
                        : 'border-slate-200 bg-white hover:border-emerald-300'
                    }`}
                  >
                    <span className={`block text-[11px] font-medium ${isActive ? 'text-emerald-700' : 'text-slate-400'}`}>
                      {dayTabFmt.format(d.date)}
                    </span>
                    <span className={`block text-sm font-semibold ${isActive ? 'text-emerald-900' : 'text-slate-700'}`}>
                      {dayNumFmt.format(d.date)}
                    </span>
                    {count > 0 && (
                      <span className="absolute -top-1.5 -right-1.5 h-4 min-w-4 px-1 rounded-full bg-emerald-600 text-white text-[10px] font-bold flex items-center justify-center">
                        {count}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>

            {/* Time slots for the active day. */}
            <div className="px-5 py-4">
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {activeSlots.map(slot => {
                  const isSel = selected.has(slot.start)
                  return (
                    <button
                      key={slot.start}
                      onClick={() => toggle(slot.start)}
                      className={`rounded-lg border px-2 py-2 text-sm font-medium transition-colors ${
                        isSel
                          ? 'border-emerald-500 bg-emerald-600 text-white'
                          : 'border-slate-200 bg-white text-slate-700 hover:border-emerald-300 hover:bg-emerald-50'
                      }`}
                    >
                      {timeFmt.format(new Date(slot.start))}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        )}

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
