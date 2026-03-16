'use client'

import { useState, useEffect, useRef } from 'react'
import { X, Plus, Loader2, AlertCircle, Check, ExternalLink } from 'lucide-react'
import { RichTextEditor, stripHtml, isHtmlEmpty } from '@/components/RichTextEditor'

// ── Constants ─────────────────────────────────────────────────────────────────

const INTERVIEW_TYPES = [
  { value: 'video',      label: '🎥 Video call'     },
  { value: 'phone',      label: '📞 Phone screen'   },
  { value: 'in_person',  label: '🏢 In-person'      },
  { value: 'panel',      label: '👥 Panel'           },
  { value: 'technical',  label: '💻 Technical'      },
  { value: 'assessment', label: '📋 Assessment'      },
] as const

const DURATION_OPTIONS = [
  { value: 30,  label: '30 min' },
  { value: 45,  label: '45 min' },
  { value: 60,  label: '1 hour' },
  { value: 90,  label: '1.5 hr' },
  { value: 120, label: '2 hr'   },
] as const

const AVATAR_COLORS = [
  'bg-blue-100 text-blue-700', 'bg-violet-100 text-violet-700',
  'bg-amber-100 text-amber-700', 'bg-emerald-100 text-emerald-700',
  'bg-pink-100 text-pink-700', 'bg-indigo-100 text-indigo-700',
]

function avatarColor(name: string) {
  const h = name.split('').reduce((a, c) => a + c.charCodeAt(0), 0)
  return AVATAR_COLORS[h % AVATAR_COLORS.length]
}

function initials(name: string) {
  return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface ScheduleApp {
  id: string
  candidate_id: string
  stage_id: string | null
  hiring_request_id: string
  candidate?: { name: string } | null
}

interface ScheduleInterviewModalProps {
  /** One or more applications to schedule interviews for */
  apps: ScheduleApp[]
  /** Job / role title — shown in success screen and GCal link */
  positionTitle: string
  /** Pre-fill first panel slot (hiring manager) */
  hmName?: string
  hmEmail?: string
  onClose: () => void
  onScheduled: () => void
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ScheduleInterviewModal({
  apps,
  positionTitle,
  hmName = '',
  hmEmail = '',
  onClose,
  onScheduled,
}: ScheduleInterviewModalProps) {
  const today = new Date()

  const toLocalDateStr = (d: Date): string => {
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
  }

  const dateStr = (() => {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1)
    const dow = d.getDay()
    if (dow === 0) d.setDate(d.getDate() + 1)
    else if (dow === 6) d.setDate(d.getDate() + 2)
    return toLocalDateStr(d)
  })()

  const [interviewType, setInterviewType] = useState<string>('video')
  const [date, setDate] = useState(dateStr)
  const [time, setTime] = useState('10:00')
  const [duration, setDuration] = useState(60)

  type PanelMember = { name: string; email: string }
  const [panel, setPanel] = useState<PanelMember[]>([{ name: hmName, email: hmEmail }])
  const [addingMember,   setAddingMember]   = useState(false)
  const [newMemberName,  setNewMemberName]  = useState('')
  const [newMemberEmail, setNewMemberEmail] = useState('')

  const [interviewer,      setInterviewer]      = useState(hmName)
  const [interviewerEmail, setInterviewerEmail] = useState(hmEmail)
  const [location,  setLocation]  = useState('')
  const [notes,     setNotes]     = useState('')
  const [saving,    setSaving]    = useState(false)
  const [saved,     setSaved]     = useState(false)
  const [scheduledAt, setScheduledAt] = useState<string | null>(null)
  const [error,     setError]     = useState('')
  const [googleConnected, setGoogleConnected] = useState(false)
  const [autoMeetLink,    setAutoMeetLink]    = useState<string | null>(null)
  const [googleMeetError, setGoogleMeetError] = useState<string | null>(null)

  const [availWeekOffset,   setAvailWeekOffset]   = useState(0)
  const [busyRangesByEmail, setBusyRangesByEmail] = useState<Record<string, { start: string; end: string }[]>>({})
  const [availLoading,      setAvailLoading]      = useState(false)
  const [availNoData,       setAvailNoData]        = useState(false)
  const [gridExpanded,      setGridExpanded]       = useState(false)

  const inlineGridRef = useRef<HTMLDivElement>(null)
  const popupGridRef  = useRef<HTMLDivElement>(null)

  // ── Helpers ─────────────────────────────────────────────────────────────────

  const getWeekDays = (anchorDate: string, offset: number): Date[] => {
    const base = new Date(anchorDate + 'T00:00:00')
    const dow = base.getDay()
    const daysToMon = dow === 0 ? -6 : -(dow - 1)
    const monday = new Date(base)
    monday.setDate(base.getDate() + daysToMon + offset * 7)
    monday.setHours(0, 0, 0, 0)
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday); d.setDate(monday.getDate() + i); return d
    })
  }

  const weekDays = getWeekDays(date, availWeekOffset)

  const HOUR_SLOTS: string[] = Array.from({ length: 96 }, (_, i) => {
    const h = Math.floor(i / 4)
    const m = (i % 4) * 15
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
  })

  const slotKey = (day: Date, slot: string) => `${toLocalDateStr(day)}T${slot}`

  const fmtSlotLabel = (slot: string) => {
    const [hStr, mStr] = slot.split(':')
    const h = parseInt(hStr, 10)
    const m = parseInt(mStr, 10)
    const period = h < 12 ? 'AM' : 'PM'
    const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h
    return `${h12}${m > 0 ? ':' + String(m).padStart(2, '0') : ''} ${period}`
  }

  const getBusyEmails = (key: string): string[] => {
    const [datePart, timePart] = key.split('T')
    const [y, mo, d]           = datePart.split('-').map(Number)
    const [h, m]               = timePart.split(':').map(Number)
    const slotStart = new Date(y, mo - 1, d, h, m, 0, 0).getTime()
    const slotEnd   = slotStart + 15 * 60 * 1000
    return Object.entries(busyRangesByEmail)
      .filter(([, ranges]) => ranges.some(r => {
        const bStart = new Date(r.start).getTime()
        const bEnd   = new Date(r.end).getTime()
        return bStart < slotEnd && bEnd > slotStart
      }))
      .map(([email]) => email)
  }
  const isBusy = (key: string) => getBusyEmails(key).length > 0

  // ── Effects ─────────────────────────────────────────────────────────────────

  useEffect(() => {
    fetch('/api/org-settings')
      .then(r => r.json())
      .then(({ data }) => setGoogleConnected(!!data?.google_connected))
      .catch(() => {})
  }, [])

  useEffect(() => {
    const emails = panel.map(m => m.email.trim().toLowerCase()).filter(Boolean)
    if (!emails.length || !googleConnected) return
    let cancelled = false
    const timer = setTimeout(async () => {
      setAvailLoading(true)
      setAvailNoData(false)
      try {
        const days  = getWeekDays(date, availWeekOffset)
        const minDt = new Date(days[0]); minDt.setHours(0, 0, 0, 0)
        const maxDt = new Date(days[6]); maxDt.setHours(23, 59, 59, 999)
        const tz    = Intl.DateTimeFormat().resolvedOptions().timeZone
        const res   = await fetch(
          `/api/google/availability?emails=${encodeURIComponent(emails.join(','))}&time_min=${minDt.toISOString()}&time_max=${maxDt.toISOString()}&timezone=${encodeURIComponent(tz)}`,
          { cache: 'no-store' }
        )
        if (!res.ok) { if (!cancelled) { setBusyRangesByEmail({}); setAvailNoData(true) }; return }
        const json = await res.json()
        if (!cancelled) {
          setBusyRangesByEmail(json.data ?? {})
          setAvailNoData(!json.data || Object.keys(json.data).length === 0)
        }
      } catch { if (!cancelled) { setBusyRangesByEmail({}); setAvailNoData(true) } }
      finally  { if (!cancelled) setAvailLoading(false) }
    }, 600)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [panel, date, availWeekOffset, googleConnected]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!gridExpanded) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setGridExpanded(false) }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [gridExpanded])

  useEffect(() => {
    if (!saved) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') { onScheduled(); onClose() } }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [saved]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (saved || gridExpanded) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [saved, gridExpanded, onClose])

  useEffect(() => {
    if (!availLoading && !availNoData && inlineGridRef.current) {
      inlineGridRef.current.scrollTop = 32 * 14
    }
  }, [availLoading, availNoData])

  useEffect(() => {
    if (gridExpanded && !availLoading && !availNoData && popupGridRef.current) {
      popupGridRef.current.scrollTop = 32 * 20
    }
  }, [gridExpanded, availLoading, availNoData])

  // ── Meeting integrations ─────────────────────────────────────────────────────

  const MEETING_INTEGRATIONS = [
    { id: 'gmeet',  label: 'Google Meet', color: 'hover:bg-blue-50 hover:border-blue-300',     url: 'https://meet.google.com/new',               placeholder: 'https://meet.google.com/xxx-yyy-zzz' },
    { id: 'zoom',   label: 'Zoom',        color: 'hover:bg-blue-50 hover:border-blue-300',     url: 'https://zoom.us/start/videomeeting',        placeholder: 'https://zoom.us/j/...' },
    { id: 'teams',  label: 'MS Teams',    color: 'hover:bg-violet-50 hover:border-violet-300', url: 'https://teams.microsoft.com/l/meeting/new', placeholder: 'https://teams.microsoft.com/l/...' },
  ] as const

  const [activePlatform, setActivePlatform] = useState<string | null>(null)

  const openIntegration = (platform: typeof MEETING_INTEGRATIONS[number]) => {
    setActivePlatform(platform.id)
    if (platform.id === 'gmeet' && googleConnected) return
    window.open(platform.url, '_blank', 'noopener')
  }

  const buildGCalLink = () => {
    if (!scheduledAt) return '#'
    const start = new Date(scheduledAt)
    const end   = new Date(start.getTime() + duration * 60000)
    const fmt   = (d: Date) => d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'
    const title = encodeURIComponent(
      `${interviewType === 'phone' ? 'Phone Screen' : 'Interview'}: ${apps.map(a => a.candidate?.name).filter(Boolean).join(', ')} — ${positionTitle}`
    )
    const details = encodeURIComponent([
      `Job: ${positionTitle}`,
      `Interviewer: ${interviewer}`,
      location ? `Link: ${location}` : '',
      !isHtmlEmpty(notes) ? `Notes: ${stripHtml(notes)}` : '',
    ].filter(Boolean).join('\n'))
    const add = interviewerEmail ? `&add=${encodeURIComponent(interviewerEmail)}` : ''
    return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${fmt(start)}/${fmt(end)}&details=${details}${add}`
  }

  // ── Submit ───────────────────────────────────────────────────────────────────

  const handleSubmit = async () => {
    if (!date || !time || !interviewer.trim()) {
      setError('Date, time and interviewer are required.')
      return
    }
    if (isBusy(`${date}T${time}`)) {
      setError('This time slot is busy. Please pick a free slot from the calendar below.')
      return
    }
    setSaving(true)
    setError('')

    const scheduled = new Date(`${date}T${time}:00`).toISOString()

    try {
      const results = await Promise.all(apps.map(app =>
        fetch('/api/interviews', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            application_id:    app.id,
            candidate_id:      app.candidate_id,
            hiring_request_id: app.hiring_request_id,
            stage_id:          app.stage_id ?? null,
            interviewer_name:  interviewer.trim(),
            interviewer_email: interviewerEmail.trim() || null,
            interview_type:    interviewType,
            scheduled_at:      scheduled,
            duration_minutes:  duration,
            location:          location.trim() || null,
            notes:             isHtmlEmpty(notes) ? null : notes,
            timezone:          Intl.DateTimeFormat().resolvedOptions().timeZone,
          }),
        }).then(r => r.json())
      ))

      const hasError = results.some(r => r.error)
      if (hasError) {
        setError(results.find(r => r.error)?.error ?? 'Failed to schedule some interviews')
        setSaving(false)
        return
      }

      setScheduledAt(scheduled)
      const firstMeetLink  = results[0]?.data?.meet_link        ?? null
      const firstMeetError = results[0]?.data?.google_meet_error ?? null
      if (firstMeetLink)  setAutoMeetLink(firstMeetLink)
      if (firstMeetError) setGoogleMeetError(firstMeetError)
      setSaved(true)
    } catch {
      setError('Network error. Please try again.')
      setSaving(false)
    }
  }

  const fmtDate = (d: string) => d
    ? new Date(d + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
    : ''

  // Deduplicate apps by candidate_id so we don't show "2 candidates" for 1 person with 2 applications
  const uniqueCandidates = Array.from(
    new Map(apps.map(a => [a.candidate_id, a.candidate])).values()
  )

  // ── Success screen ───────────────────────────────────────────────────────────

  if (saved && scheduledAt) {
    const fmtScheduled = new Date(scheduledAt).toLocaleString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
        <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md p-8 text-center">
          <div className="h-14 w-14 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
            <Check className="h-7 w-7 text-emerald-600" />
          </div>
          <h2 className="text-lg font-bold text-slate-900 mb-1">
            {uniqueCandidates.length === 1 ? 'Interview scheduled!' : `${apps.length} interviews scheduled!`}
          </h2>
          <p className="text-sm text-slate-500 mb-1">{fmtScheduled}</p>
          {interviewerEmail && (
            <p className="text-xs text-slate-400 mb-6">Interviewer: {interviewer} ({interviewerEmail})</p>
          )}

          <div className="flex flex-col gap-2.5 mb-5">
            {googleMeetError && !autoMeetLink && (
              <div className="rounded-xl bg-amber-50 border border-amber-200 px-3 py-2.5 text-left">
                <p className="text-xs font-semibold text-amber-700 mb-0.5">Calendar invite not sent automatically</p>
                <p className="text-[11px] text-amber-600 break-all">{googleMeetError}</p>
                <p className="text-[11px] text-amber-500 mt-1">Use the &ldquo;Add to Google Calendar&rdquo; button below to invite manually.</p>
              </div>
            )}
            {autoMeetLink && (
              <div className="flex items-center justify-between gap-2 rounded-xl bg-green-50 border border-green-200 px-3 py-2.5">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-green-500">✓</span>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-green-700">Google Meet created</p>
                    <p className="text-[11px] text-green-600 truncate">{autoMeetLink}</p>
                  </div>
                </div>
                <a href={autoMeetLink} target="_blank" rel="noopener noreferrer"
                  className="shrink-0 text-xs font-medium text-green-700 underline hover:text-green-900">
                  Join
                </a>
              </div>
            )}
            <a
              href={buildGCalLink()}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
            >
              <span>📅</span> {autoMeetLink ? 'View in Google Calendar' : 'Add to Google Calendar'}
            </a>
            {location && !autoMeetLink && (
              <a href={location} target="_blank" rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 w-full rounded-xl border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm font-medium text-blue-700 hover:bg-blue-100 transition-colors">
                <ExternalLink className="h-4 w-4" /> Open meeting link
              </a>
            )}
          </div>

          <button
            onClick={() => { onScheduled(); onClose() }}
            className="w-full rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    )
  }

  // ── Form ─────────────────────────────────────────────────────────────────────

  return (<>
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div>
            <h2 className="text-base font-bold text-slate-900">Schedule Interview</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              {uniqueCandidates.length === 1
                ? uniqueCandidates[0]?.name
                  ? `Scheduling for ${uniqueCandidates[0].name}`
                  : `For ${positionTitle}`
                : `Scheduling for ${uniqueCandidates.length} candidates`}
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4 max-h-[75vh] overflow-y-auto">
          {/* Candidates chips (shown only when truly multiple distinct candidates) */}
          {uniqueCandidates.length > 1 && (
            <div className="flex flex-wrap gap-1.5">
              {uniqueCandidates.map((candidate, i) => (
                <span key={i} className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
                  <div className={`h-4 w-4 rounded-full flex items-center justify-center text-[9px] font-bold ${avatarColor(candidate?.name ?? '')}`}>
                    {initials(candidate?.name ?? '?')}
                  </div>
                  {candidate?.name}
                </span>
              ))}
            </div>
          )}

          {/* Interview Panel */}
          <div className="rounded-xl border border-slate-200 overflow-visible">
            <div className="flex items-center justify-between px-3 py-2 bg-slate-50 border-b border-slate-200">
              <span className="text-xs font-semibold text-slate-600">Interview Panel</span>
              <button
                onClick={() => { setAddingMember(true); setNewMemberName(''); setNewMemberEmail('') }}
                className="flex items-center gap-1 text-[11px] font-medium text-blue-600 hover:text-blue-800 transition-colors"
              >
                <Plus className="h-3 w-3" /> Add interviewer
              </button>
            </div>

            {panel.map((member, i) => (
              <div key={i} className="flex items-center gap-2.5 px-3 py-2.5 border-b border-slate-100 last:border-b-0">
                <div className={`h-7 w-7 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${avatarColor(member.name || '?')}`}>
                  {initials(member.name || '?')}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-slate-700 leading-snug">{member.name || <span className="text-slate-400 italic">No name</span>}</p>
                  {member.email && <p className="text-[11px] text-slate-400 truncate">{member.email}</p>}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {i === 0 && (
                    <span className="text-[9px] font-semibold text-slate-400 bg-slate-100 rounded-full px-1.5 py-0.5">HM</span>
                  )}
                  <button
                    onClick={() => { if (member.email) { setInterviewer(member.name); setInterviewerEmail(member.email) } }}
                    disabled={!member.email}
                    className={`text-[10px] font-medium rounded-full px-2 py-0.5 border transition-colors ${
                      interviewer === member.name && interviewerEmail === member.email
                        ? 'bg-blue-50 text-blue-600 border-blue-200'
                        : member.email
                        ? 'text-slate-400 border-slate-200 hover:border-blue-200 hover:text-blue-600 hover:bg-blue-50 bg-white'
                        : 'text-slate-300 border-slate-100 bg-white cursor-not-allowed'
                    }`}
                    title={member.email ? 'Set as primary interviewer (receives calendar invite)' : 'Add email to send invite'}
                  >
                    ✉ {interviewer === member.name && interviewerEmail === member.email ? 'Invite ✓' : 'Invite'}
                  </button>
                </div>
                <button
                  onClick={() => {
                    const next = panel.filter((_, j) => j !== i)
                    setPanel(next)
                    if (interviewer === member.name && interviewerEmail === member.email) {
                      setInterviewer(next[0]?.name ?? '')
                      setInterviewerEmail(next[0]?.email ?? '')
                    }
                  }}
                  className="h-5 w-5 flex items-center justify-center rounded text-slate-300 hover:text-red-400 hover:bg-red-50 transition-colors"
                  title={i === 0 ? 'Remove hiring manager from panel' : 'Remove from panel'}
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}

            {addingMember && (
              <div className="flex items-center gap-2 px-3 py-2.5 border-t border-slate-100 bg-slate-50">
                <input
                  autoFocus
                  value={newMemberName}
                  onChange={e => setNewMemberName(e.target.value)}
                  placeholder="Name"
                  className="flex-1 min-w-0 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-300"
                />
                <input
                  type="email"
                  value={newMemberEmail}
                  onChange={e => setNewMemberEmail(e.target.value)}
                  placeholder="Email"
                  onKeyDown={e => {
                    if (e.key === 'Enter' && newMemberName.trim()) {
                      const nm = { name: newMemberName.trim(), email: newMemberEmail.trim() }
                      setPanel(p => [...p, nm])
                      if (!interviewer.trim()) { setInterviewer(nm.name); setInterviewerEmail(nm.email) }
                      setAddingMember(false)
                    }
                    if (e.key === 'Escape') setAddingMember(false)
                  }}
                  className="flex-1 min-w-0 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-300"
                />
                <button
                  onClick={() => {
                    if (!newMemberName.trim()) return
                    const nm = { name: newMemberName.trim(), email: newMemberEmail.trim() }
                    setPanel(p => [...p, nm])
                    if (!interviewer.trim()) { setInterviewer(nm.name); setInterviewerEmail(nm.email) }
                    setAddingMember(false)
                  }}
                  disabled={!newMemberName.trim()}
                  className="shrink-0 px-2.5 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 disabled:opacity-40 transition-colors"
                >
                  Add
                </button>
                <button
                  onClick={() => setAddingMember(false)}
                  className="shrink-0 h-6 w-6 flex items-center justify-center rounded text-slate-400 hover:text-slate-600 transition-colors"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          </div>

          {/* Interview type */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Interview type</label>
            <div className="grid grid-cols-3 gap-1.5">
              {INTERVIEW_TYPES.map(t => (
                <button
                  key={t.value}
                  onClick={() => setInterviewType(t.value)}
                  className={`px-2.5 py-2 rounded-xl border text-xs font-medium transition-colors text-left ${
                    interviewType === t.value
                      ? 'border-blue-400 bg-blue-50 text-blue-700'
                      : 'border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Duration */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Duration</label>
            <div className="flex gap-1.5">
              {DURATION_OPTIONS.map(d => (
                <button
                  key={d.value}
                  onClick={() => setDuration(d.value)}
                  className={`flex-1 px-2 py-2 rounded-xl border text-xs font-medium transition-colors ${
                    duration === d.value
                      ? 'border-blue-400 bg-blue-50 text-blue-700'
                      : 'border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>

          {/* Date + Time */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Date</label>
              <input
                type="date"
                value={date}
                min={toLocalDateStr(new Date())}
                onChange={e => { setDate(e.target.value); setAvailWeekOffset(0) }}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
              {date && <p className="text-xs text-slate-400 mt-1">{fmtDate(date)}</p>}
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Time</label>
              <input
                type="time"
                value={time}
                onChange={e => setTime(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>
          </div>

          {/* Availability grid */}
          {googleConnected && panel.some(m => m.email.trim()) && (
            <div className="rounded-xl border border-slate-200 overflow-hidden">
              <div className="flex items-center justify-between px-3 py-2 bg-slate-50 border-b border-slate-200">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-xs font-semibold text-slate-600 shrink-0">Panel Availability</span>
                  <div className="flex items-center -space-x-1">
                    {panel.filter(m => m.email.trim()).map((m, i) => (
                      <div key={i} title={`${m.name}\n${m.email}`}
                        className={`h-4 w-4 rounded-full border border-white flex items-center justify-center text-[8px] font-bold shrink-0 ${avatarColor(m.name || '?')}`}>
                        {initials(m.name || '?')}
                      </div>
                    ))}
                  </div>
                  <span className="text-[9px] text-slate-400 truncate max-w-[140px]"
                    title={panel.filter(m => m.email.trim()).map(m => m.email).join(', ')}>
                    {panel.filter(m => m.email.trim()).map(m => m.email.split('@')[0]).join(', ')}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => setAvailWeekOffset(o => o - 1)}
                    className="h-5 w-5 rounded flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-200 transition-colors text-xs">‹</button>
                  <span className="text-[10px] text-slate-500 px-1 whitespace-nowrap">
                    {weekDays[0].toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – {weekDays[6].toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </span>
                  <button onClick={() => setAvailWeekOffset(o => o + 1)}
                    className="h-5 w-5 rounded flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-200 transition-colors text-xs">›</button>
                  <button onClick={() => setGridExpanded(true)} title="Open full calendar"
                    className="h-5 w-5 rounded flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-200 transition-colors text-xs ml-0.5">⤢</button>
                </div>
              </div>

              {availLoading ? (
                <div className="p-3 grid grid-cols-6 gap-1 animate-pulse">
                  {Array.from({ length: 30 }).map((_, i) => <div key={i} className="rounded bg-slate-100 h-4" />)}
                </div>
              ) : availNoData ? (
                <div className="px-3 py-4 text-center text-xs text-slate-400">
                  No calendar data — {panel.filter(m => m.email.trim()).length > 1 ? 'panel members may be' : 'interviewer may be'} outside your Google Workspace domain
                </div>
              ) : (
                <div ref={inlineGridRef} className="overflow-x-auto overflow-y-auto max-h-[280px]">
                  <table className="w-full text-[10px]">
                    <thead className="sticky top-0 bg-white z-10">
                      <tr>
                        <th className="w-10 px-1 py-1.5 text-left text-slate-400 font-normal border-b border-slate-100 bg-white" />
                        {weekDays.map(d => {
                          const isWeekend = d.getDay() === 0 || d.getDay() === 6
                          return (
                            <th key={d.toISOString()} className={`px-0.5 py-1.5 text-center font-semibold border-b border-slate-100 whitespace-nowrap text-[10px] ${isWeekend ? 'bg-slate-50 text-slate-400' : 'bg-white text-slate-500'}`}>
                              {d.toLocaleDateString('en-US', { weekday: 'short' })} {d.getDate()}
                            </th>
                          )
                        })}
                      </tr>
                    </thead>
                    <tbody>
                      {HOUR_SLOTS.map(slot => (
                        <tr key={slot} className={slot.endsWith(':00') ? 'border-t border-slate-200' : slot.endsWith(':30') ? 'border-t border-slate-100' : 'border-t border-slate-50'}>
                          <td className="px-1 py-0 text-slate-300 text-right whitespace-nowrap leading-none text-[10px]" style={{ height: 14 }}>
                            {slot.endsWith(':00') ? fmtSlotLabel(slot) : ''}
                          </td>
                          {weekDays.map(day => {
                            const key = slotKey(day, slot)
                            const busyEmails = getBusyEmails(key)
                            const busy = busyEmails.length > 0
                            const isSelected = date === toLocalDateStr(day) && time === slot
                            const isWeekend = day.getDay() === 0 || day.getDay() === 6
                            const isInBlock = (() => {
                              if (!date || !time || date !== toLocalDateStr(day)) return false
                              const [selH, selM] = time.split(':').map(Number)
                              const [slH, slM]   = slot.split(':').map(Number)
                              const selMin = selH * 60 + selM
                              const slMin  = slH * 60 + slM
                              return slMin >= selMin && slMin < selMin + duration
                            })()
                            const isLastOfBlock = isInBlock && (() => {
                              if (!date || !time || date !== toLocalDateStr(day)) return false
                              const [selH, selM] = time.split(':').map(Number)
                              const [slH, slM]   = slot.split(':').map(Number)
                              const selMin = selH * 60 + selM
                              const slMin  = slH * 60 + slM
                              return slMin + 15 >= selMin + duration
                            })()
                            const blockRound = !isInBlock ? 'rounded'
                              : isSelected && isLastOfBlock ? 'rounded'
                              : isSelected    ? 'rounded-t'
                              : isLastOfBlock ? 'rounded-b'
                              : 'rounded-none'
                            return (
                              <td key={key} className={`px-0.5 ${isInBlock ? 'py-0' : 'py-px'} ${isWeekend ? 'bg-slate-50/60' : ''}`}>
                                <button
                                  disabled={busy}
                                  onClick={() => { setDate(toLocalDateStr(day)); setTime(slot); setAvailWeekOffset(0) }}
                                  style={{ height: 14 }}
                                  className={`w-full transition-colors ${blockRound} ${
                                    busy
                                      ? (isSelected || isInBlock) ? 'bg-red-300 ring-1 ring-blue-400 cursor-not-allowed' : 'bg-red-100 cursor-not-allowed'
                                      : isSelected ? 'bg-blue-600'
                                      : isInBlock  ? 'bg-blue-200 hover:bg-blue-300 cursor-pointer'
                                      : isWeekend  ? 'bg-slate-100 hover:bg-slate-200 cursor-pointer'
                                      : 'bg-emerald-50 hover:bg-emerald-200 cursor-pointer'
                                  }`}
                                  title={busy ? `Busy: ${busyEmails.join(', ')}` : `${day.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} at ${fmtSlotLabel(slot)}`}
                                />
                              </td>
                            )
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="flex items-center gap-3 px-3 py-1.5 border-t border-slate-100 bg-slate-50 flex-wrap">
                    <span className="flex items-center gap-1 text-[10px] text-slate-400"><span className="inline-block h-2.5 w-4 rounded bg-emerald-100 border border-emerald-200" /> Free</span>
                    <span className="flex items-center gap-1 text-[10px] text-slate-400"><span className="inline-block h-2.5 w-4 rounded bg-red-100" /> Busy</span>
                    <span className="flex items-center gap-1 text-[10px] text-slate-400"><span className="inline-block h-2.5 w-4 rounded bg-blue-600" /> Start</span>
                    <span className="flex items-center gap-1 text-[10px] text-slate-400"><span className="inline-block h-2.5 w-4 rounded bg-blue-200" /> Duration block</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Meeting platform + link */}
          {interviewType !== 'in_person' && interviewType !== 'phone' && (
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Meeting platform</label>
              <div className="grid grid-cols-3 gap-1.5 mb-2">
                {MEETING_INTEGRATIONS.map(p => (
                  <button key={p.id} onClick={() => openIntegration(p)}
                    className={`flex flex-col items-center gap-1 px-2 py-2.5 rounded-xl border text-xs font-medium transition-colors ${
                      activePlatform === p.id ? 'border-blue-400 bg-blue-50 text-blue-700' : `border-slate-200 text-slate-600 ${p.color}`
                    }`}>
                    <span className="text-base">{p.id === 'gmeet' ? '🎥' : p.id === 'zoom' ? '💻' : '🟦'}</span>
                    {p.label}
                    {p.id !== 'gmeet' && <span className="text-[9px] font-normal text-slate-400 leading-none">Coming soon</span>}
                  </button>
                ))}
              </div>
              {activePlatform === 'gmeet' && googleConnected ? (
                <div className="flex items-center gap-2 rounded-xl bg-green-50 border border-green-200 px-3 py-2.5">
                  <span className="text-green-500 text-base">✓</span>
                  <div>
                    <p className="text-xs font-semibold text-green-700">Google Meet link will be auto-created</p>
                    <p className="text-[11px] text-green-600">Calendar invites sent to candidate &amp; interviewer on schedule</p>
                  </div>
                </div>
              ) : (
                <>
                  {activePlatform && activePlatform !== 'gmeet' && (
                    <p className="text-xs text-slate-400 mb-1.5">Copy the link from the new tab and paste it below</p>
                  )}
                  {(!activePlatform || activePlatform !== 'gmeet') && (
                    <input
                      value={location}
                      onChange={e => setLocation(e.target.value)}
                      placeholder={activePlatform ? MEETING_INTEGRATIONS.find(p => p.id === activePlatform)?.placeholder ?? 'Paste meeting link...' : 'Paste meeting link (Zoom, Meet, Teams…)'}
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-400"
                    />
                  )}
                </>
              )}
            </div>
          )}

          {/* Location (in-person / phone) */}
          {(interviewType === 'in_person' || interviewType === 'phone') && (
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                {interviewType === 'in_person' ? 'Address / Room' : 'Phone number or dial-in'}
              </label>
              <input
                value={location}
                onChange={e => setLocation(e.target.value)}
                placeholder={interviewType === 'in_person' ? 'e.g. 4th floor, Room B' : 'e.g. +1 (555) 000-0000'}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>
          )}

          {/* Notes */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">
              Notes <span className="font-normal text-slate-400">(optional)</span>
            </label>
            <RichTextEditor value={notes} onChange={setNotes} placeholder="Topics to cover, prep instructions…" />
          </div>

          {error && (
            <div className="flex items-center gap-2 rounded-xl bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-3 px-6 py-4 border-t border-slate-100 bg-slate-50/60">
          <button onClick={onClose}
            className="flex-1 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-white transition-colors">
            Cancel
          </button>
          <button onClick={handleSubmit} disabled={saving}
            className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 text-sm font-semibold transition-colors disabled:opacity-60">
            {saving ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Scheduling…</>
            ) : (
              `Schedule ${uniqueCandidates.length > 1 ? `${apps.length} interviews` : 'interview'}`
            )}
          </button>
        </div>
      </div>
    </div>

    {/* Full-screen popup grid */}
    {gridExpanded && (
      <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm"
        onClick={() => setGridExpanded(false)}>
        <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-[800px] max-w-[95vw] max-h-[85vh] flex flex-col overflow-hidden"
          onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100 bg-slate-50/60 shrink-0">
            <div className="flex items-center gap-2.5">
              <span className="text-sm font-semibold text-slate-700">Panel Availability</span>
              <div className="flex items-center -space-x-1">
                {panel.filter(m => m.email.trim()).map((m, i) => (
                  <div key={i} title={`${m.name} (${m.email})`}
                    className={`h-5 w-5 rounded-full border-2 border-white flex items-center justify-center text-[9px] font-bold shrink-0 ${avatarColor(m.name || '?')}`}>
                    {initials(m.name || '?')}
                  </div>
                ))}
              </div>
              {panel.filter(m => m.email.trim()).length > 1 && (
                <span className="text-[10px] text-slate-400">combined</span>
              )}
            </div>
            <div className="flex items-center gap-1">
              <button onClick={() => setAvailWeekOffset(o => o - 1)}
                className="h-7 w-7 rounded-lg flex items-center justify-center text-slate-500 hover:text-slate-700 hover:bg-slate-200 transition-colors">‹</button>
              <span className="text-xs font-medium text-slate-600 px-2 whitespace-nowrap">
                {weekDays[0].toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – {weekDays[6].toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </span>
              <button onClick={() => setAvailWeekOffset(o => o + 1)}
                className="h-7 w-7 rounded-lg flex items-center justify-center text-slate-500 hover:text-slate-700 hover:bg-slate-200 transition-colors">›</button>
              <button onClick={() => setGridExpanded(false)}
                className="h-7 w-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors ml-2" title="Close (Esc)">
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div ref={popupGridRef} className="flex-1 overflow-y-auto">
            {availLoading ? (
              <div className="p-4 grid grid-cols-6 gap-1.5 animate-pulse">
                {Array.from({ length: 60 }).map((_, i) => <div key={i} className="rounded bg-slate-100 h-7" />)}
              </div>
            ) : availNoData ? (
              <div className="flex flex-col items-center justify-center h-48 gap-2 text-slate-400">
                <span className="text-2xl">📅</span>
                <span className="text-sm text-center px-8">
                  No calendar data — {panel.filter(m => m.email.trim()).length > 1 ? 'panel members may be' : 'interviewer may be'} outside your Google Workspace domain
                </span>
              </div>
            ) : (
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-white z-10">
                  <tr>
                    <th className="w-16 px-3 py-2 text-left text-slate-400 font-normal border-b border-slate-100 bg-white" />
                    {weekDays.map(d => {
                      const isWeekend = d.getDay() === 0 || d.getDay() === 6
                      return (
                        <th key={d.toISOString()} className={`px-2 py-2 text-center font-semibold border-b border-slate-100 whitespace-nowrap ${isWeekend ? 'bg-slate-50 text-slate-400' : 'bg-white text-slate-600'}`}>
                          {d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                        </th>
                      )
                    })}
                  </tr>
                </thead>
                <tbody>
                  {HOUR_SLOTS.map(slot => (
                    <tr key={slot} className={slot.endsWith(':00') ? 'border-t border-slate-200' : slot.endsWith(':30') ? 'border-t border-slate-100' : 'border-t border-slate-50'}>
                      <td className="px-3 py-0 text-slate-300 text-right whitespace-nowrap leading-none text-[11px]" style={{ height: 20 }}>
                        {slot.endsWith(':00') ? fmtSlotLabel(slot) : slot.endsWith(':30') ? fmtSlotLabel(slot) : ''}
                      </td>
                      {weekDays.map(day => {
                        const key = slotKey(day, slot)
                        const busyEmails = getBusyEmails(key)
                        const busy = busyEmails.length > 0
                        const isSelected = date === toLocalDateStr(day) && time === slot
                        const isWeekend = day.getDay() === 0 || day.getDay() === 6
                        const isInBlock = (() => {
                          if (!date || !time || date !== toLocalDateStr(day)) return false
                          const [selH, selM] = time.split(':').map(Number)
                          const [slH, slM]   = slot.split(':').map(Number)
                          return (slH * 60 + slM) >= (selH * 60 + selM) && (slH * 60 + slM) < (selH * 60 + selM) + duration
                        })()
                        const isLastOfBlock = isInBlock && (() => {
                          if (!date || !time || date !== toLocalDateStr(day)) return false
                          const [selH, selM] = time.split(':').map(Number)
                          const [slH, slM]   = slot.split(':').map(Number)
                          return (slH * 60 + slM) + 15 >= (selH * 60 + selM) + duration
                        })()
                        const blockRound = !isInBlock ? 'rounded'
                          : isSelected && isLastOfBlock ? 'rounded'
                          : isSelected    ? 'rounded-t'
                          : isLastOfBlock ? 'rounded-b'
                          : 'rounded-none'
                        return (
                          <td key={key} className={`px-1 ${isInBlock ? 'py-0' : 'py-px'} ${isWeekend ? 'bg-slate-50/60' : ''}`}>
                            <button
                              disabled={busy}
                              onClick={() => { setDate(toLocalDateStr(day)); setTime(slot); setAvailWeekOffset(0); setGridExpanded(false) }}
                              style={{ height: 20 }}
                              className={`w-full transition-colors ${blockRound} ${
                                busy
                                  ? (isSelected || isInBlock) ? 'bg-red-300 ring-1 ring-blue-400 cursor-not-allowed' : 'bg-red-100 cursor-not-allowed'
                                  : isSelected ? 'bg-blue-600'
                                  : isInBlock  ? 'bg-blue-200 hover:bg-blue-300 cursor-pointer'
                                  : isWeekend  ? 'bg-slate-100 hover:bg-slate-200 cursor-pointer'
                                  : 'bg-emerald-50 hover:bg-emerald-200 cursor-pointer'
                              }`}
                              title={busy ? `Busy: ${busyEmails.join(', ')}` : `${day.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} at ${fmtSlotLabel(slot)}`}
                            />
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="flex items-center gap-4 px-5 py-2.5 border-t border-slate-100 bg-slate-50/60 shrink-0">
            <span className="flex items-center gap-1.5 text-xs text-slate-400"><span className="inline-block h-3 w-5 rounded bg-emerald-100 border border-emerald-200" /> Free</span>
            <span className="flex items-center gap-1.5 text-xs text-slate-400"><span className="inline-block h-3 w-5 rounded bg-red-100" /> Busy</span>
            <span className="flex items-center gap-1.5 text-xs text-slate-400"><span className="inline-block h-3 w-5 rounded bg-blue-600" /> Start</span>
            <span className="flex items-center gap-1.5 text-xs text-slate-400"><span className="inline-block h-3 w-5 rounded bg-blue-200" /> Duration block</span>
            <span className="ml-auto text-xs text-slate-400">Esc to close</span>
          </div>
        </div>
      </div>
    )}
  </>)
}
