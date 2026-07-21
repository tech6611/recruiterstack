'use client'

import { useState, useEffect, useCallback } from 'react'
import { Loader2, Calendar, ExternalLink, X, Copy, Check } from 'lucide-react'

interface InterviewRow {
  id: string
  interviewer_name: string | null
  interview_type: string | null
  scheduled_at: string
  duration_minutes: number | null
  status: string
  location: string | null
  meeting_platform: string | null
  self_schedule_token: string | null
  calendar_event_id: string | null
}

// A self-schedule invite the candidate hasn't booked yet: it has a booking token
// but no real calendar event, and its scheduled_at is a throwaway placeholder
// (send-time + 7 days). Show these as "awaiting the candidate" rather than as a
// confirmed interview with a misleading date.
function isPendingInvite(iv: InterviewRow): boolean {
  return iv.status === 'scheduled' && !iv.calendar_event_id && !!iv.self_schedule_token
}

const STATUS_STYLES: Record<string, string> = {
  scheduled:   'bg-blue-50 text-blue-600 border-blue-200',
  completed:   'bg-emerald-50 text-emerald-600 border-emerald-200',
  cancelled:   'bg-slate-100 text-slate-500 border-slate-200',
  no_show:     'bg-amber-50 text-amber-600 border-amber-200',
  rescheduled: 'bg-violet-50 text-violet-600 border-violet-200',
}

function fmt(iso: string) {
  return new Date(iso).toLocaleString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function platformLabel(p: string | null) {
  return p === 'google_meet' ? 'Google Meet' : p === 'ms_teams' ? 'Teams' : p === 'zoom' ? 'Zoom' : null
}

export default function InterviewsTab({ candidateId }: { candidateId: string }) {
  const [interviews, setInterviews] = useState<InterviewRow[] | null>(null)
  const [error, setError]           = useState<string | null>(null)
  const [confirmingCancel, setConfirmingCancel] = useState<string | null>(null)
  const [busy, setBusy]             = useState<string | null>(null)
  const [copied, setCopied]         = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/interviews?candidate_id=${candidateId}`, { cache: 'no-store' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to load interviews')
      setInterviews(json.data ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load interviews')
    }
  }, [candidateId])

  useEffect(() => { load() }, [load])

  const cancel = async (id: string) => {
    setBusy(id)
    try {
      const res = await fetch(`/api/interviews/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'cancelled' }),
      })
      if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.error || 'Failed to cancel') }
      setConfirmingCancel(null)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to cancel')
    } finally {
      setBusy(null)
    }
  }

  const copyLink = (token: string, id: string, reschedule: boolean) => {
    const url = `${window.location.origin}/schedule/${token}${reschedule ? '?reschedule=1' : ''}`
    navigator.clipboard.writeText(url).then(() => {
      setCopied(id)
      setTimeout(() => setCopied(c => (c === id ? null : c)), 2500)
    })
  }

  if (error && !interviews) {
    return <div className="p-6 text-sm text-red-500">{error}</div>
  }
  if (!interviews) {
    return <div className="p-8 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>
  }
  if (interviews.length === 0) {
    return (
      <div className="p-10 text-center">
        <Calendar className="h-8 w-8 text-slate-300 mx-auto mb-3" />
        <p className="text-sm text-slate-500">No interviews scheduled yet.</p>
        <p className="text-xs text-slate-400 mt-1">Use “Schedule Interview” above to set one up.</p>
      </div>
    )
  }

  return (
    <div className="p-4 space-y-3">
      {error && <div className="text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2">{error}</div>}
      {interviews.map(iv => {
        const link = iv.location && /^https?:\/\//.test(iv.location) ? iv.location : null
        const isCancelled = iv.status === 'cancelled'
        const pending = isPendingInvite(iv)
        return (
          <div key={iv.id} className={`rounded-xl border border-slate-200 p-4 ${isCancelled ? 'opacity-60' : ''}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-800">
                  {pending ? 'Awaiting candidate to pick a time' : fmt(iv.scheduled_at)}
                </p>
                <p className="text-xs text-slate-500 mt-0.5">
                  {iv.interviewer_name || 'Interviewer'} · {iv.duration_minutes ?? 60} min
                  {platformLabel(iv.meeting_platform) ? ` · ${platformLabel(iv.meeting_platform)}` : ''}
                </p>
              </div>
              <span className={`text-[10px] font-semibold uppercase tracking-wide rounded-full border px-2 py-0.5 shrink-0 ${pending ? 'bg-amber-50 text-amber-600 border-amber-200' : STATUS_STYLES[iv.status] ?? 'bg-slate-50 text-slate-500 border-slate-200'}`}>
                {pending ? 'Invite sent' : iv.status.replace('_', ' ')}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2 mt-3">
              {link && (
                <a href={link} target="_blank" rel="noopener noreferrer"
                   className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 hover:text-emerald-700">
                  <ExternalLink className="h-3.5 w-3.5" /> Join
                </a>
              )}

              {!isCancelled && iv.status !== 'completed' && iv.self_schedule_token && (
                <button
                  onClick={() => copyLink(iv.self_schedule_token!, iv.id, !pending)}
                  className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-700"
                >
                  {copied === iv.id ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied === iv.id ? 'Copied' : pending ? 'Copy booking link' : 'Copy reschedule link'}
                </button>
              )}

              {!isCancelled && iv.status !== 'completed' && (
                confirmingCancel === iv.id ? (
                  <span className="inline-flex items-center gap-1.5 text-xs">
                    <span className="text-slate-500">Cancel this interview?</span>
                    <button
                      onClick={() => cancel(iv.id)}
                      disabled={busy === iv.id}
                      className="inline-flex items-center gap-1 font-semibold text-red-600 hover:text-red-700 disabled:opacity-50"
                    >
                      {busy === iv.id ? <Loader2 className="h-3 w-3 animate-spin" /> : null} Yes, cancel
                    </button>
                    <button onClick={() => setConfirmingCancel(null)} className="text-slate-400 hover:text-slate-600">Keep</button>
                  </span>
                ) : (
                  <button
                    onClick={() => setConfirmingCancel(iv.id)}
                    className="inline-flex items-center gap-1 text-xs font-medium text-slate-400 hover:text-red-500"
                  >
                    <X className="h-3.5 w-3.5" /> Cancel
                  </button>
                )
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
