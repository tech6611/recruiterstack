'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { Loader2, CheckCircle, AlertCircle, CalendarClock } from 'lucide-react'
import { inputClsWhite, labelCls } from '@/lib/ui/styles'

// Days shown Monday-first; value is the JS getDay() index (0=Sun).
const DAYS: { idx: number; label: string; short: string }[] = [
  { idx: 1, label: 'Monday',    short: 'Mon' },
  { idx: 2, label: 'Tuesday',   short: 'Tue' },
  { idx: 3, label: 'Wednesday', short: 'Wed' },
  { idx: 4, label: 'Thursday',  short: 'Thu' },
  { idx: 5, label: 'Friday',    short: 'Fri' },
  { idx: 6, label: 'Saturday',  short: 'Sat' },
  { idx: 0, label: 'Sunday',    short: 'Sun' },
]

const COMMON_TIMEZONES = [
  'Asia/Kolkata', 'Asia/Singapore', 'Asia/Dubai', 'Asia/Tokyo',
  'Europe/London', 'Europe/Berlin', 'Europe/Paris',
  'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
  'Australia/Sydney', 'UTC',
]

interface DayState { enabled: boolean; start: string; end: string }  // start/end as "HH:MM"

function minToTime(min: number): string {
  const h = Math.floor(min / 60)
  const m = min % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}
function timeToMin(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

const DEFAULT_DAY: DayState = { enabled: false, start: '09:00', end: '18:00' }

export default function InterviewerPreferencesPage() {
  const params = useParams<{ token: string }>()
  const token = params.token

  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)
  const [saving, setSaving]   = useState(false)
  const [saved, setSaved]     = useState(false)

  const [name, setName]         = useState('')
  const [email, setEmail]       = useState('')
  const [timezone, setTimezone] = useState('Asia/Kolkata')
  const [tzOptions, setTzOptions] = useState<string[]>(COMMON_TIMEZONES)
  const [note, setNote]         = useState('')
  const [minPerDay, setMinPerDay] = useState('')   // '' = no limit
  const [maxPerDay, setMaxPerDay] = useState('')   // '' = no limit
  const [days, setDays]         = useState<Record<number, DayState>>(
    Object.fromEntries(DAYS.map(d => [d.idx, { ...DEFAULT_DAY }])),
  )

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`/api/interviewer/${token}`)
        if (!res.ok) {
          const j = await res.json().catch(() => ({}))
          throw new Error(j.error || 'This link is not valid.')
        }
        const { data } = await res.json()
        if (cancelled) return

        setName(data.name || '')
        setEmail(data.email || '')

        // Ensure the stored/detected tz is selectable.
        const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone
        const tz = data.timezone || browserTz || 'Asia/Kolkata'
        setTimezone(tz)
        setTzOptions(Array.from(new Set([tz, browserTz, ...COMMON_TIMEZONES].filter(Boolean))))

        setNote(data.note || '')
        setMinPerDay(data.minPerDay != null ? String(data.minPerDay) : '')
        setMaxPerDay(data.maxPerDay != null ? String(data.maxPerDay) : '')

        // Map returned windows onto per-day rows (first window per day wins).
        const next = Object.fromEntries(DAYS.map(d => [d.idx, { ...DEFAULT_DAY }])) as Record<number, DayState>
        for (const w of (data.windows || []) as { day: number; start: number; end: number }[]) {
          if (next[w.day] && !next[w.day].enabled) {
            next[w.day] = { enabled: true, start: minToTime(w.start), end: minToTime(w.end) }
          }
        }
        setDays(next)
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Something went wrong.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [token])

  function setDay(idx: number, patch: Partial<DayState>) {
    setDays(prev => ({ ...prev, [idx]: { ...prev[idx], ...patch } }))
    setSaved(false)
  }

  async function handleSave() {
    setError(null)

    // Build + validate windows.
    const windows: { day: number; start: number; end: number }[] = []
    for (const d of DAYS) {
      const state = days[d.idx]
      if (!state.enabled) continue
      const start = timeToMin(state.start)
      const end   = timeToMin(state.end)
      if (start >= end) {
        setError(`${d.label}: the end time must be after the start time.`)
        return
      }
      windows.push({ day: d.idx, start, end })
    }
    if (windows.length === 0) {
      setError('Please mark at least one day and time when you can interview.')
      return
    }

    // Daily load limits: blank = no limit; otherwise a whole number, min ≤ max.
    const minVal = minPerDay.trim() === '' ? null : Number(minPerDay)
    const maxVal = maxPerDay.trim() === '' ? null : Number(maxPerDay)
    for (const [label, v] of [['Minimum', minVal], ['Maximum', maxVal]] as const) {
      if (v !== null && (!Number.isInteger(v) || v < 0 || v > 20)) {
        setError(`${label} interviews per day must be a whole number between 0 and 20.`)
        return
      }
    }
    if (minVal !== null && maxVal !== null && minVal > maxVal) {
      setError('Minimum interviews per day can’t be more than the maximum.')
      return
    }

    setSaving(true)
    try {
      const res = await fetch(`/api/interviewer/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          timezone, windows, note: note.trim() || null,
          minPerDay: minVal, maxPerDay: maxVal,
        }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error || 'Failed to save. Please try again.')
      }
      setSaved(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    )
  }

  if (error && !email) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
        <div className="max-w-md text-center">
          <AlertCircle className="h-10 w-10 text-rose-500 mx-auto mb-3" />
          <h1 className="text-lg font-semibold text-slate-800">Link not valid</h1>
          <p className="text-sm text-slate-500 mt-1">{error}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 py-10 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <div className="h-10 w-10 rounded-xl bg-emerald-100 flex items-center justify-center">
            <CalendarClock className="h-5 w-5 text-emerald-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Your interview availability</h1>
            <p className="text-sm text-slate-500">
              {name ? `${name} · ` : ''}{email}
            </p>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-6">
          <p className="text-sm text-slate-600">
            Set the days and times you&rsquo;re generally happy to take interviews. Candidates will
            only be offered slots inside these hours <span className="font-medium">and</span> when
            you&rsquo;re actually free on your calendar. You can change this anytime from this link.
          </p>

          {/* Timezone */}
          <div>
            <label className={labelCls}>Your timezone</label>
            <select
              className={inputClsWhite}
              value={timezone}
              onChange={e => { setTimezone(e.target.value); setSaved(false) }}
            >
              {tzOptions.map(tz => <option key={tz} value={tz}>{tz.replace(/_/g, ' ')}</option>)}
            </select>
          </div>

          {/* Weekly grid */}
          <div>
            <label className={labelCls}>Weekly hours</label>
            <div className="space-y-2">
              {DAYS.map(d => {
                const state = days[d.idx]
                return (
                  <div
                    key={d.idx}
                    className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 transition ${
                      state.enabled ? 'border-emerald-200 bg-emerald-50/40' : 'border-slate-200 bg-slate-50'
                    }`}
                  >
                    <label className="flex items-center gap-2.5 w-32 shrink-0 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={state.enabled}
                        onChange={e => setDay(d.idx, { enabled: e.target.checked })}
                        className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-400"
                      />
                      <span className={`text-sm font-medium ${state.enabled ? 'text-slate-800' : 'text-slate-400'}`}>
                        {d.label}
                      </span>
                    </label>

                    {state.enabled ? (
                      <div className="flex items-center gap-2 text-sm text-slate-700">
                        <input
                          type="time"
                          value={state.start}
                          onChange={e => setDay(d.idx, { start: e.target.value })}
                          className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 outline-none focus:border-emerald-400"
                        />
                        <span className="text-slate-400">to</span>
                        <input
                          type="time"
                          value={state.end}
                          onChange={e => setDay(d.idx, { end: e.target.value })}
                          className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 outline-none focus:border-emerald-400"
                        />
                      </div>
                    ) : (
                      <span className="text-sm text-slate-400">Unavailable</span>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Daily interview load */}
          <div>
            <label className={labelCls}>Interviews per day <span className="font-normal text-slate-400">(optional)</span></label>
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <span className="text-xs text-slate-500">Minimum</span>
                <input
                  type="number"
                  min={0}
                  max={20}
                  value={minPerDay}
                  onChange={e => { setMinPerDay(e.target.value); setSaved(false) }}
                  placeholder="No min"
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-400"
                />
              </div>
              <div className="flex-1">
                <span className="text-xs text-slate-500">Maximum</span>
                <input
                  type="number"
                  min={0}
                  max={20}
                  value={maxPerDay}
                  onChange={e => { setMaxPerDay(e.target.value); setSaved(false) }}
                  placeholder="No max"
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-400"
                />
              </div>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Once you already have your <span className="font-medium">maximum</span> interviews booked on a day,
              candidates won&rsquo;t be offered any more slots that day. The minimum is a target shared with the recruiter.
            </p>
          </div>

          {/* Free-text note */}
          <div>
            <label className={labelCls}>Anything else? <span className="font-normal text-slate-400">(optional)</span></label>
            <textarea
              className={inputClsWhite}
              rows={3}
              placeholder="e.g. Prefer mid-week, avoid the first slot of the morning, 30-min buffer between interviews…"
              value={note}
              onChange={e => { setNote(e.target.value); setSaved(false) }}
            />
            <p className="text-xs text-slate-400 mt-1">Shared with the recruiter as context. It doesn&rsquo;t change the bookable times above.</p>
          </div>

          {error && (
            <div className="flex items-start gap-2 text-sm text-rose-600 bg-rose-50 rounded-lg px-3 py-2">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex items-center gap-3">
            <button
              onClick={handleSave}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60 transition"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {saving ? 'Saving…' : 'Save availability'}
            </button>
            {saved && (
              <span className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-600">
                <CheckCircle className="h-4 w-4" /> Saved
              </span>
            )}
          </div>
        </div>

        <p className="text-center text-xs text-slate-400 mt-6">Powered by RecruiterStack</p>
      </div>
    </div>
  )
}
