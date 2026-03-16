'use client'

import { useState } from 'react'
import { Calendar, X, Loader2, AlertCircle, CheckCheck, Copy } from 'lucide-react'

import type { Application, HiringRequest } from '@/lib/types/database'

const INTERVIEW_TYPE_OPTS = [
  { value: 'video',      label: 'Video Call' },
  { value: 'phone',      label: 'Phone Screen' },
  { value: 'in_person',  label: 'In Person' },
  { value: 'panel',      label: 'Panel' },
  { value: 'technical',  label: 'Technical' },
  { value: 'assessment', label: 'Assessment' },
]

type ApplicationWithHiringRequest = Application & {
  hiring_requests: Pick<HiringRequest, 'id' | 'position_title' | 'department' | 'ticket_number'> | null
}

interface ScheduleInterviewDrawerProps {
  activeApps: ApplicationWithHiringRequest[]
  defaultAppId: string
  candidateId: string
  onClose: () => void
  onSaved: () => void
}

export default function ScheduleInterviewDrawer({
  activeApps,
  defaultAppId,
  candidateId,
  onClose,
  onSaved,
}: ScheduleInterviewDrawerProps) {
  const [appId,           setAppId]           = useState(defaultAppId)
  const [interviewer,     setInterviewer]     = useState('')
  const [interviewType,   setInterviewType]   = useState('video')
  const [scheduledAt,     setScheduledAt]     = useState('')
  const [duration,        setDuration]        = useState(60)
  const [location,        setLocation]        = useState('')
  const [notes,           setNotes]           = useState('')
  const [selfSchedule,    setSelfSchedule]    = useState(false)
  const [saving,          setSaving]          = useState(false)
  const [error,           setError]           = useState('')
  const [selfSchedToken,  setSelfSchedToken]  = useState<string | null>(null)
  const [copied,          setCopied]          = useState(false)

  const selectedApp = activeApps.find(a => a.id === appId)

  const submit = async () => {
    if (!interviewer.trim() || !scheduledAt) {
      setError('Interviewer name and date/time are required.')
      return
    }
    setSaving(true); setError('')
    const res = await fetch('/api/interviews', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        application_id:     appId,
        candidate_id:       candidateId,
        hiring_request_id:  selectedApp?.hiring_request_id ?? '',
        stage_id:           selectedApp?.stage_id ?? null,
        interviewer_name:   interviewer.trim(),
        interview_type:     interviewType,
        scheduled_at:       new Date(scheduledAt).toISOString(),
        duration_minutes:   duration,
        location:           location.trim() || null,
        notes:              notes.trim() || null,
        generate_self_schedule: selfSchedule,
      }),
    })
    const json = await res.json()
    setSaving(false)
    if (!res.ok) { setError(json.error ?? 'Failed to schedule interview'); return }
    if (json.data?.self_schedule_token) {
      setSelfSchedToken(json.data.self_schedule_token)
    } else {
      onSaved()
      onClose()
    }
  }

  const copyToken = () => {
    if (!selfSchedToken) return
    navigator.clipboard.writeText(`${window.location.origin}/schedule/${selfSchedToken}`)
    setCopied(true); setTimeout(() => setCopied(false), 2000)
  }

  if (selfSchedToken) {
    return (
      <div className="fixed inset-0 z-50 flex justify-end">
        <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => { onSaved(); onClose() }} />
        <div className="relative flex h-full w-full max-w-lg flex-col bg-white shadow-2xl">
          <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
            <div className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-amber-500" />
              <h2 className="text-base font-bold text-slate-900">Self-Schedule Link</h2>
            </div>
            <button onClick={() => { onSaved(); onClose() }} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="flex-1 px-6 py-8 flex flex-col items-center justify-center gap-4 text-center">
            <div className="h-14 w-14 rounded-full bg-amber-50 flex items-center justify-center">
              <Calendar className="h-7 w-7 text-amber-500" />
            </div>
            <div>
              <p className="text-base font-bold text-slate-900 mb-1">Interview Scheduled!</p>
              <p className="text-sm text-slate-500">Share this link so the candidate can confirm a time slot.</p>
            </div>
            <div className="w-full rounded-xl border border-slate-200 bg-slate-50 p-4 text-left">
              <p className="text-xs font-semibold text-slate-400 mb-1.5">Self-schedule link</p>
              <p className="text-xs font-mono text-slate-600 break-all">{`${window.location.origin}/schedule/${selfSchedToken}`}</p>
            </div>
            <button
              onClick={copyToken}
              className={`flex items-center gap-2 rounded-xl border px-5 py-2.5 text-sm font-semibold transition-all ${
                copied ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              {copied ? <><CheckCheck className="h-4 w-4" />Copied!</> : <><Copy className="h-4 w-4" />Copy Link</>}
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative flex h-full w-full max-w-lg flex-col bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 shrink-0">
          <div className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-amber-500" />
            <h2 className="text-base font-bold text-slate-900">Schedule Interview</h2>
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
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-800 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100"
              >
                {activeApps.map(a => (
                  <option key={a.id} value={a.id}>{a.hiring_requests?.position_title ?? a.id}</option>
                ))}
              </select>
            </div>
          )}

          {/* Interview type */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1.5">Interview Type</label>
            <div className="flex flex-wrap gap-1.5">
              {INTERVIEW_TYPE_OPTS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setInterviewType(opt.value)}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-all ${
                    interviewType === opt.value
                      ? 'border-amber-400 bg-amber-50 text-amber-700 ring-1 ring-amber-300'
                      : 'border-slate-200 text-slate-600 hover:border-slate-300'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Interviewer */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1.5">Interviewer Name *</label>
            <input
              value={interviewer}
              onChange={e => setInterviewer(e.target.value)}
              placeholder="e.g. Sarah Chen"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-800 placeholder-slate-400 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100"
            />
          </div>

          {/* Date/time + duration row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1.5">Date & Time *</label>
              <input
                type="datetime-local"
                value={scheduledAt}
                onChange={e => setScheduledAt(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-800 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1.5">Duration (min)</label>
              <select
                value={duration}
                onChange={e => setDuration(Number(e.target.value))}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-800 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100"
              >
                {[15, 30, 45, 60, 90, 120].map(d => <option key={d} value={d}>{d} min</option>)}
              </select>
            </div>
          </div>

          {/* Location */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1.5">Location / Link</label>
            <input
              value={location}
              onChange={e => setLocation(e.target.value)}
              placeholder="Zoom link, office address, or phone number…"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-800 placeholder-slate-400 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100"
            />
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1.5">Notes (optional)</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              placeholder="Topics to cover, special instructions…"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-800 placeholder-slate-400 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100 resize-none"
            />
          </div>

          {/* Self-schedule toggle */}
          <label className="flex items-center gap-3 cursor-pointer rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
            <input
              type="checkbox"
              checked={selfSchedule}
              onChange={e => setSelfSchedule(e.target.checked)}
              className="rounded text-amber-500 focus:ring-amber-400"
            />
            <div>
              <p className="text-xs font-semibold text-slate-700">Generate self-schedule link</p>
              <p className="text-[10px] text-slate-400 mt-0.5">Candidate can confirm their preferred time slot</p>
            </div>
          </label>

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
            className="flex items-center gap-2 rounded-xl bg-amber-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-amber-600 transition-colors disabled:opacity-60"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Calendar className="h-4 w-4" />}
            Schedule Interview
          </button>
        </div>
      </div>
    </div>
  )
}
