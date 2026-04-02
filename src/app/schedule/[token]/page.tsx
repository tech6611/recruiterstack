'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import { Loader2, Check, AlertCircle, ChevronLeft, ChevronRight, ExternalLink } from 'lucide-react'
import { trackEvent } from '@/lib/analytics'

// ── Types ─────────────────────────────────────────────────────────────────────

interface PanelMember { name: string; email: string }

interface InterviewData {
  id: string
  token: string
  interviewer_name: string
  interview_type: string
  duration_minutes: number
  meeting_platform: string | null
  status: string
  scheduled_at: string | null
  expires_at: string | null
  panel: PanelMember[]
}

interface SchedulePayload {
  interview: InterviewData
  position_title: string | null
  candidate_name: string | null
  busy_slots: Record<string, { start: string; end: string }[]>
  week: { start: string; end: string; offset: number }
}

interface ConfirmResult {
  success: boolean
  scheduled_at: string
  meet_link: string | null
  meeting_platform: string | null
  reschedule_url: string
  interviewer_name: string
  duration_minutes: number
  position_title: string
  candidate_name: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const HOUR_SLOTS = Array.from({ length: 96 }, (_, i) => {
  const h = Math.floor(i / 4)
  const m = (i % 4) * 15
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
})

function fmtSlotLabel(slot: string) {
  const [hStr, mStr] = slot.split(':')
  const h = parseInt(hStr, 10)
  const m = parseInt(mStr, 10)
  const period = h < 12 ? 'AM' : 'PM'
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h
  return `${h12}${m > 0 ? ':' + String(m).padStart(2, '0') : ''} ${period}`
}

function toLocalDateStr(d: Date) {
  const y = d.getFullYear()
  const mo = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${mo}-${day}`
}

function platformLabel(p: string | null) {
  if (p === 'google_meet') return 'Google Meet'
  if (p === 'ms_teams')   return 'Microsoft Teams'
  if (p === 'zoom')       return 'Zoom'
  return 'Video call'
}

function platformIcon(p: string | null) {
  if (p === 'google_meet') return '🎥'
  if (p === 'ms_teams')   return '🟦'
  if (p === 'zoom')       return '💻'
  return '📹'
}

function typeLabel(t: string) {
  const map: Record<string, string> = {
    video: 'Video call', phone: 'Phone screen', in_person: 'In-person',
    panel: 'Panel interview', technical: 'Technical interview', assessment: 'Assessment',
  }
  return map[t] ?? t
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function SchedulePage() {
  const params       = useParams()
  const searchParams = useSearchParams()
  const token        = params.token as string
  const isReschedule = searchParams.get('reschedule') === '1'

  const [loading,     setLoading]     = useState(true)
  const [error,       setError]       = useState<string | null>(null)
  const [payload,     setPayload]     = useState<SchedulePayload | null>(null)
  const [weekOffset,  setWeekOffset]  = useState(0)
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [confirming,  setConfirming]  = useState(false)
  const [confirmed,   setConfirmed]   = useState<ConfirmResult | null>(null)
  const [copied,      setCopied]      = useState(false)
  const tracked = useRef(false)

  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone

  const fetchWeek = useCallback(async (offset: number) => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(
        `/api/schedule/${token}?week=${offset}&timezone=${encodeURIComponent(tz)}`,
        { cache: 'no-store' }
      )
      const json = await res.json()
      if (!res.ok) { setError(json.error ?? 'Failed to load schedule'); return }
      setPayload(json)
      if (!tracked.current) {
        tracked.current = true
        trackEvent('schedule_page_viewed', { is_reschedule: isReschedule })
      }
    } catch {
      setError('Network error. Please refresh and try again.')
    } finally {
      setLoading(false)
    }
  }, [token, tz])

  useEffect(() => { fetchWeek(weekOffset) }, [weekOffset, fetchWeek])

  // Build week days from payload
  const weekDays: Date[] = payload ? (() => {
    const start = new Date(payload.week.start)
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start); d.setDate(start.getDate() + i); return d
    })
  })() : []

  // Check if a slot is busy for any panel member
  const isBusy = (dateStr: string, slot: string): boolean => {
    if (!payload) return false
    const [y, mo, d] = dateStr.split('-').map(Number)
    const [h, m]     = slot.split(':').map(Number)
    const slotStart  = new Date(y, mo - 1, d, h, m, 0, 0).getTime()
    const slotEnd    = slotStart + 15 * 60 * 1000
    return Object.values(payload.busy_slots).some(ranges =>
      ranges.some(r => {
        const bStart = new Date(r.start).getTime()
        const bEnd   = new Date(r.end).getTime()
        return bStart < slotEnd && bEnd > slotStart
      })
    )
  }

  // Check if entire duration block starting at slot is free
  const isBlockFree = (dateStr: string, slot: string): boolean => {
    if (!payload) return false
    const duration = payload.interview.duration_minutes
    const [y, mo, d] = dateStr.split('-').map(Number)
    const [h, m]     = slot.split(':').map(Number)
    const blockStart = new Date(y, mo - 1, d, h, m, 0, 0).getTime()
    const blockEnd   = blockStart + duration * 60 * 1000
    return !Object.values(payload.busy_slots).some(ranges =>
      ranges.some(r => {
        const bStart = new Date(r.start).getTime()
        const bEnd   = new Date(r.end).getTime()
        return bStart < blockEnd && bEnd > blockStart
      })
    )
  }

  const isPast = (dateStr: string, slot: string): boolean => {
    const [y, mo, d] = dateStr.split('-').map(Number)
    const [h, m]     = slot.split(':').map(Number)
    return new Date(y, mo - 1, d, h, m) < new Date()
  }

  const isInSelectedBlock = (dateStr: string, slot: string): boolean => {
    if (!selectedKey || !payload) return false
    const [selDate, selSlot] = selectedKey.split('T')
    if (selDate !== dateStr) return false
    const [sh, sm] = selSlot.split(':').map(Number)
    const [h, m]   = slot.split(':').map(Number)
    const selMin   = sh * 60 + sm
    const slMin    = h * 60 + m
    return slMin >= selMin && slMin < selMin + payload.interview.duration_minutes
  }

  const handleConfirm = async () => {
    if (!selectedKey || !payload) return
    setConfirming(true)
    try {
      const [dateStr, slotStr] = selectedKey.split('T')
      const [y, mo, d] = dateStr.split('-').map(Number)
      const [h, m]     = slotStr.split(':').map(Number)
      const dt = new Date(y, mo - 1, d, h, m, 0, 0)
      const res = await fetch(`/api/schedule/${token}/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scheduled_at: dt.toISOString(),
          timezone: tz,
          reschedule: isReschedule,
        }),
      })
      const json = await res.json()
      if (!res.ok) { alert(json.error ?? 'Failed to confirm. Please try again.'); return }
      setConfirmed(json)
      trackEvent('interview_scheduled', {
        duration_minutes: payload.interview.duration_minutes,
        is_reschedule: isReschedule,
      })
    } catch {
      alert('Network error. Please try again.')
    } finally {
      setConfirming(false)
    }
  }

  const fmtConfirmedDate = (iso: string) =>
    new Date(iso).toLocaleString('en-US', {
      weekday: 'long', month: 'long', day: 'numeric',
      hour: '2-digit', minute: '2-digit', timeZoneName: 'short',
    })

  // ── Error state ─────────────────────────────────────────────────────────────
  if (!loading && error) {
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

  // ── Success state ────────────────────────────────────────────────────────────
  if (confirmed) {
    const fmtTime = fmtConfirmedDate(confirmed.scheduled_at)
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm max-w-md w-full p-8 text-center">
          <div className="h-14 w-14 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
            <Check className="h-7 w-7 text-emerald-600" />
          </div>
          <h2 className="text-lg font-bold text-slate-900 mb-1">
            {isReschedule ? 'Interview rescheduled!' : 'Interview confirmed!'}
          </h2>
          <p className="text-sm text-slate-500 mb-1">{fmtTime}</p>
          <p className="text-xs text-slate-400 mb-6">
            With {confirmed.interviewer_name} · {confirmed.duration_minutes} min · {platformLabel(confirmed.meeting_platform)}
          </p>

          <div className="flex flex-col gap-2.5 mb-6">
            {confirmed.meet_link && (
              <a href={confirmed.meet_link} target="_blank" rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 text-sm font-medium transition-colors">
                <ExternalLink className="h-4 w-4" />
                Join {platformLabel(confirmed.meeting_platform)}
              </a>
            )}
            <p className="text-xs text-slate-400">
              A calendar invite has been sent to your email with the meeting link.
            </p>
          </div>

          <div className="border-t border-slate-100 pt-5">
            <p className="text-xs text-slate-500 mb-2">Need to change the time?</p>
            <button
              onClick={() => {
                setCopied(false)
                navigator.clipboard.writeText(confirmed.reschedule_url).then(() => setCopied(true))
              }}
              className="text-xs text-blue-600 hover:text-blue-800 underline"
            >
              {copied ? '✓ Copied reschedule link' : 'Copy reschedule link'}
            </button>
            <p className="text-[11px] text-slate-400 mt-1">
              Or open: <a href={confirmed.reschedule_url} className="underline text-slate-500 break-all">{confirmed.reschedule_url}</a>
            </p>
          </div>
        </div>
      </div>
    )
  }

  // ── Main scheduling UI ───────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-50">
      {/* Top bar */}
      <div className="bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-lg bg-blue-600 flex items-center justify-center">
            <span className="text-white text-[11px] font-bold">RS</span>
          </div>
          <span className="text-sm font-semibold text-slate-700">RecruiterStack</span>
        </div>
        {payload?.interview.expires_at && (
          <span className="text-[11px] text-slate-400">
            Link expires {new Date(payload.interview.expires_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </span>
        )}
      </div>

      <div className="max-w-3xl mx-auto px-4 py-8">
        {/* Interview info card */}
        {payload && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 mb-6">
            {isReschedule && (
              <div className="flex items-center gap-2 rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 mb-4">
                <AlertCircle className="h-4 w-4 text-amber-500 shrink-0" />
                <p className="text-xs text-amber-700 font-medium">You&apos;re rescheduling your interview — pick a new time below</p>
              </div>
            )}
            <h1 className="text-lg font-bold text-slate-900 mb-1">
              {isReschedule ? 'Reschedule your interview' : 'Schedule your interview'}
            </h1>
            {payload.position_title && (
              <p className="text-sm text-slate-500 mb-4">{payload.position_title}</p>
            )}
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-xl bg-slate-50 border border-slate-100 px-3 py-2.5">
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-0.5">With</p>
                <p className="text-xs font-semibold text-slate-700">{payload.interview.interviewer_name}</p>
              </div>
              <div className="rounded-xl bg-slate-50 border border-slate-100 px-3 py-2.5">
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-0.5">Duration</p>
                <p className="text-xs font-semibold text-slate-700">{payload.interview.duration_minutes} min</p>
              </div>
              <div className="rounded-xl bg-slate-50 border border-slate-100 px-3 py-2.5">
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-0.5">Format</p>
                <p className="text-xs font-semibold text-slate-700">
                  {payload.interview.meeting_platform
                    ? `${platformIcon(payload.interview.meeting_platform)} ${platformLabel(payload.interview.meeting_platform)}`
                    : typeLabel(payload.interview.interview_type)}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Availability grid */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          {/* Week nav header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50/60">
            <h2 className="text-sm font-semibold text-slate-700">Pick a time</h2>
            <div className="flex items-center gap-1">
              <button
                onClick={() => { setWeekOffset(o => o - 1); setSelectedKey(null) }}
                disabled={weekOffset <= 0}
                className="h-7 w-7 rounded-lg flex items-center justify-center text-slate-500 hover:text-slate-700 hover:bg-slate-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="text-xs font-medium text-slate-600 px-2 whitespace-nowrap min-w-[120px] text-center">
                {loading || !weekDays.length ? '…' : `${weekDays[0].toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${weekDays[6].toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}
              </span>
              <button
                onClick={() => { setWeekOffset(o => o + 1); setSelectedKey(null) }}
                className="h-7 w-7 rounded-lg flex items-center justify-center text-slate-500 hover:text-slate-700 hover:bg-slate-200 transition-colors"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-24 gap-3 text-slate-400">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span className="text-sm">Loading availability…</span>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto overflow-y-auto max-h-[480px]" style={{ scrollbarWidth: 'thin' }}>
                <table className="w-full text-[10px]">
                  <thead className="sticky top-0 bg-white z-10">
                    <tr>
                      <th className="w-12 px-2 py-2 text-left text-slate-400 font-normal border-b border-slate-100 bg-white" />
                      {weekDays.map(d => {
                        const isWeekend = d.getDay() === 0 || d.getDay() === 6
                        const isToday   = toLocalDateStr(d) === toLocalDateStr(new Date())
                        return (
                          <th key={d.toISOString()}
                            className={`px-0.5 py-2 text-center font-semibold border-b border-slate-100 whitespace-nowrap ${isWeekend ? 'bg-slate-50 text-slate-400' : isToday ? 'bg-blue-50 text-blue-700' : 'bg-white text-slate-600'}`}>
                            <div>{d.toLocaleDateString('en-US', { weekday: 'short' })}</div>
                            <div className={`text-[11px] mt-0.5 ${isToday ? 'bg-blue-600 text-white rounded-full w-5 h-5 flex items-center justify-center mx-auto text-[10px]' : ''}`}>
                              {d.getDate()}
                            </div>
                          </th>
                        )
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {HOUR_SLOTS.map(slot => (
                      <tr key={slot} className={
                        slot.endsWith(':00') ? 'border-t border-slate-200'
                        : slot.endsWith(':30') ? 'border-t border-slate-100'
                        : 'border-t border-slate-50'
                      }>
                        <td className="px-2 py-0 text-slate-300 text-right whitespace-nowrap leading-none text-[10px]" style={{ height: 16 }}>
                          {slot.endsWith(':00') ? fmtSlotLabel(slot) : ''}
                        </td>
                        {weekDays.map(day => {
                          const dateStr   = toLocalDateStr(day)
                          const key       = `${dateStr}T${slot}`
                          const past      = isPast(dateStr, slot)
                          const busy      = isBusy(dateStr, slot)
                          const blockFree = !busy && isBlockFree(dateStr, slot)
                          const selected  = selectedKey === key
                          const inBlock   = isInSelectedBlock(dateStr, slot)
                          const isWeekend = day.getDay() === 0 || day.getDay() === 6
                          const clickable = !past && !busy && blockFree

                          return (
                            <td key={key} className={`px-0.5 py-0 ${isWeekend ? 'bg-slate-50/60' : ''}`}>
                              <button
                                disabled={!clickable}
                                onClick={() => {
                                  if (clickable) {
                                    setSelectedKey(key)
                                    trackEvent('slot_selected', { day_of_week: day.toLocaleDateString('en-US', { weekday: 'long' }) })
                                  } else {
                                    setSelectedKey(null)
                                  }
                                }}
                                style={{ height: 16 }}
                                className={`w-full rounded transition-colors ${
                                  past   ? 'bg-slate-100/50 cursor-not-allowed'
                                  : busy  ? 'bg-red-50 cursor-not-allowed'
                                  : selected ? 'bg-blue-600 rounded-t'
                                  : inBlock  ? 'bg-blue-200 hover:bg-blue-300 cursor-pointer rounded-none'
                                  : clickable ? 'bg-emerald-50 hover:bg-emerald-200 cursor-pointer'
                                  : 'bg-slate-100 cursor-not-allowed'
                                }`}
                                title={
                                  past   ? 'Past'
                                  : busy  ? 'Unavailable'
                                  : clickable ? `${day.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} at ${fmtSlotLabel(slot)}`
                                  : 'Unavailable'
                                }
                              />
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Legend */}
              <div className="flex items-center gap-4 px-4 py-2.5 border-t border-slate-100 bg-slate-50/60">
                <span className="flex items-center gap-1.5 text-[10px] text-slate-400">
                  <span className="inline-block h-3 w-4 rounded bg-emerald-100 border border-emerald-200" /> Available
                </span>
                <span className="flex items-center gap-1.5 text-[10px] text-slate-400">
                  <span className="inline-block h-3 w-4 rounded bg-red-50 border border-red-100" /> Busy
                </span>
                <span className="flex items-center gap-1.5 text-[10px] text-slate-400">
                  <span className="inline-block h-3 w-4 rounded bg-blue-600" /> Selected
                </span>
                <span className="flex items-center gap-1.5 text-[10px] text-slate-400">
                  <span className="inline-block h-3 w-4 rounded bg-blue-200" /> Duration
                </span>
              </div>
            </>
          )}
        </div>

        {/* Confirm bar */}
        {selectedKey && payload && (() => {
          const [dateStr, slotStr] = selectedKey.split('T')
          const [y, mo, d] = dateStr.split('-').map(Number)
          const [h, m]     = slotStr.split(':').map(Number)
          const dt = new Date(y, mo - 1, d, h, m, 0, 0)
          const endDt = new Date(dt.getTime() + payload.interview.duration_minutes * 60 * 1000)
          const fmtRange = `${dt.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })} · ${dt.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })} – ${endDt.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZoneName: 'short' })}`
          return (
            <div className="mt-4 bg-white rounded-2xl border border-blue-200 shadow-sm p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold text-slate-700">Selected time</p>
                <p className="text-sm font-bold text-blue-700 mt-0.5">{fmtRange}</p>
              </div>
              <button
                onClick={handleConfirm}
                disabled={confirming}
                className="shrink-0 flex items-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 text-sm font-semibold transition-colors disabled:opacity-60"
              >
                {confirming ? <><Loader2 className="h-4 w-4 animate-spin" /> Confirming…</> : 'Confirm interview'}
              </button>
            </div>
          )
        })()}

        <p className="text-center text-[11px] text-slate-400 mt-6">
          Powered by RecruiterStack · All times shown in {tz.replace('_', ' ')}
        </p>
      </div>
    </div>
  )
}
