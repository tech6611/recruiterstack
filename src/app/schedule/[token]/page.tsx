'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import { Loader2, Check, AlertCircle, ExternalLink, CalendarClock } from 'lucide-react'
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

interface Slot { start: string; end: string }  // ISO UTC

interface SchedulePayload {
  interview: InterviewData
  position_title: string | null
  candidate_name: string | null
  slots: Slot[]
  business_day_count: number
  has_interviewers: boolean
  calendar_checked: boolean
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

  const [loading,     setLoading]    = useState(true)
  const [error,       setError]      = useState<string | null>(null)
  const [payload,     setPayload]    = useState<SchedulePayload | null>(null)
  const [selected,    setSelected]   = useState<string | null>(null)   // chosen slot ISO
  const [confirming,  setConfirming] = useState(false)
  const [confirmed,   setConfirmed]  = useState<ConfirmResult | null>(null)
  const [copied,      setCopied]     = useState(false)
  const tracked = useRef(false)

  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
  const tzLabel = tz.replace(/_/g, ' ')

  const fetchSlots = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/schedule/${token}?timezone=${encodeURIComponent(tz)}`, { cache: 'no-store' })
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
  }, [token, tz, isReschedule])

  useEffect(() => { fetchSlots() }, [fetchSlots])

  // Group slots by the candidate's local day.
  const groups = useMemo(() => {
    if (!payload) return []
    const dayFmt  = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'long', month: 'short', day: 'numeric' })
    const timeFmt = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit' })
    const map = new Map<string, { label: string; items: { iso: string; label: string }[] }>()
    for (const s of payload.slots) {
      const d = new Date(s.start)
      const dayKey = dayFmt.format(d)
      if (!map.has(dayKey)) map.set(dayKey, { label: dayKey, items: [] })
      map.get(dayKey)!.items.push({ iso: s.start, label: timeFmt.format(d) })
    }
    return Array.from(map.values())
  }, [payload, tz])

  const handleConfirm = async () => {
    if (!selected) return
    setConfirming(true)
    try {
      const res = await fetch(`/api/schedule/${token}/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scheduled_at: selected, timezone: tz, reschedule: isReschedule }),
      })
      const json = await res.json()
      if (!res.ok) { alert(json.error ?? 'Failed to confirm. Please try again.'); return }
      setConfirmed(json)
      trackEvent('interview_scheduled', {
        duration_minutes: payload?.interview.duration_minutes ?? 0,
        is_reschedule: isReschedule,
      })
    } catch {
      alert('Network error. Please try again.')
    } finally {
      setConfirming(false)
    }
  }

  const fmtSelected = (iso: string) =>
    new Date(iso).toLocaleString('en-US', {
      weekday: 'long', month: 'long', day: 'numeric',
      hour: '2-digit', minute: '2-digit', timeZoneName: 'short',
    })

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

  // ── Confirmed ────────────────────────────────────────────────────────────────
  if (confirmed) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm max-w-md w-full p-8 text-center">
          <div className="h-14 w-14 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
            <Check className="h-7 w-7 text-emerald-600" />
          </div>
          <h2 className="text-lg font-bold text-slate-900 mb-1">
            {isReschedule ? 'Interview rescheduled!' : 'Interview confirmed!'}
          </h2>
          <p className="text-sm text-slate-500 mb-1">{fmtSelected(confirmed.scheduled_at)}</p>
          <p className="text-xs text-slate-400 mb-6">
            With {confirmed.interviewer_name} · {confirmed.duration_minutes} min · {platformLabel(confirmed.meeting_platform)}
          </p>

          <div className="flex flex-col gap-2.5 mb-6">
            {confirmed.meet_link && (
              <a href={confirmed.meet_link} target="_blank" rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 text-sm font-medium transition-colors">
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
              className="text-xs text-emerald-600 hover:text-emerald-800 underline"
            >
              {copied ? '✓ Copied reschedule link' : 'Copy reschedule link'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  const hasSlots = groups.length > 0

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
        {payload?.interview.expires_at && (
          <span className="text-[11px] text-slate-400">
            Link expires {new Date(payload.interview.expires_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </span>
        )}
      </div>

      <div className="max-w-2xl mx-auto px-4 py-8">
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
            {payload.position_title && <p className="text-sm text-slate-500 mb-4">{payload.position_title}</p>}
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

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/60">
            <h2 className="text-sm font-semibold text-slate-700">Pick a time</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Please choose a slot within the next {payload?.business_day_count ?? 7} business days.
              Times are shown in your timezone ({tzLabel}).
            </p>
          </div>

          {/* No interviewer availability configured */}
          {payload && !payload.has_interviewers && (
            <div className="px-5 py-12 text-center">
              <CalendarClock className="h-8 w-8 text-slate-300 mx-auto mb-3" />
              <p className="text-sm text-slate-500">Availability for this interview hasn&apos;t been set up yet.</p>
              <p className="text-xs text-slate-400 mt-1">Please contact your recruiter for a time.</p>
            </div>
          )}

          {/* Interviewers set, but no open times */}
          {payload && payload.has_interviewers && !hasSlots && (
            <div className="px-5 py-12 text-center">
              <CalendarClock className="h-8 w-8 text-slate-300 mx-auto mb-3" />
              <p className="text-sm text-slate-500">No open times in the next {payload.business_day_count} business days.</p>
              <p className="text-xs text-slate-400 mt-1">Please reach out to your recruiter and they&apos;ll find a slot for you.</p>
            </div>
          )}

          {/* Tentative note when we couldn't check a live calendar */}
          {hasSlots && payload && !payload.calendar_checked && (
            <div className="flex items-start gap-2 px-5 py-3 bg-amber-50 border-b border-amber-100">
              <AlertCircle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
              <p className="text-xs text-amber-700">
                These times reflect the interviewer&apos;s stated hours. They haven&apos;t been checked
                against a live calendar, so the recruiter may confirm the final time with you.
              </p>
            </div>
          )}

          {/* Slots grouped by day */}
          {hasSlots && (
            <div className="divide-y divide-slate-100">
              {groups.map(group => (
                <div key={group.label} className="px-5 py-4">
                  <p className="text-xs font-semibold text-slate-600 mb-2.5">{group.label}</p>
                  <div className="flex flex-wrap gap-2">
                    {group.items.map(item => {
                      const isSel = selected === item.iso
                      return (
                        <button
                          key={item.iso}
                          onClick={() => setSelected(item.iso)}
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
          )}
        </div>

        {/* Confirm bar */}
        {selected && (
          <div className="sticky bottom-4 mt-4">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-lg p-4 flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="text-[11px] text-slate-400 uppercase tracking-wide font-semibold">Selected</p>
                <p className="text-sm font-semibold text-slate-800 truncate">{fmtSelected(selected)}</p>
              </div>
              <button
                onClick={handleConfirm}
                disabled={confirming}
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 text-sm font-semibold disabled:opacity-60 transition-colors shrink-0"
              >
                {confirming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                {confirming ? 'Confirming…' : isReschedule ? 'Confirm new time' : 'Confirm interview'}
              </button>
            </div>
          </div>
        )}

        <p className="text-center text-xs text-slate-400 mt-6">Powered by RecruiterStack</p>
      </div>
    </div>
  )
}
