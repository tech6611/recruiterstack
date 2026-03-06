'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { Loader2, CheckCircle, Clock, AlertCircle, Sparkles, Send } from 'lucide-react'

interface RequestInfo {
  ticket_number: string | null
  position_title: string
  department: string | null
  hiring_manager_name: string
  status: string
  intake_submitted_at: string | null
  jd_sent_at: string | null
  created_at: string
}

const STEPS = [
  {
    key: 'created',
    label: 'Intake request created',
    sub: 'Recruiter created the hiring request',
    doneStatuses: ['intake_pending', 'intake_submitted', 'jd_generated', 'jd_sent', 'jd_approved', 'posted'],
  },
  {
    key: 'submitted',
    label: 'Requirements & JD submitted',
    sub: 'You completed the intake form',
    doneStatuses: ['intake_submitted', 'jd_generated', 'jd_sent', 'jd_approved', 'posted'],
  },
  {
    key: 'jd_ready',
    label: 'JD with recruiter',
    sub: 'Recruiter is reviewing the Job Description',
    doneStatuses: ['jd_approved', 'posted'],
    activeStatuses: ['jd_generated', 'jd_sent'],
  },
  {
    key: 'posted',
    label: 'Posted to job boards',
    sub: 'Position is live and accepting applications',
    doneStatuses: ['posted'],
  },
]

export default function IntakeStatusPage() {
  const { token } = useParams<{ token: string }>()
  const [info, setInfo] = useState<RequestInfo | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/intake/${token}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) setError(d.error)
        else setInfo(d.data)
        setLoading(false)
      })
      .catch(() => { setError('Failed to load status.'); setLoading(false) })
  }, [token])

  if (loading) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <Loader2 className="h-7 w-7 animate-spin text-slate-300" />
    </div>
  )

  if (error || !info) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="text-center max-w-sm">
        <AlertCircle className="h-10 w-10 text-red-400 mx-auto mb-4" />
        <h2 className="text-lg font-bold text-slate-800">Link not valid</h2>
        <p className="text-sm text-slate-500 mt-2">{error ?? 'This status page could not be found.'}</p>
      </div>
    </div>
  )

  const fmt = (d: string) =>
    new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

  return (
    <div className="min-h-screen bg-slate-50 py-10 px-4">
      <div className="max-w-lg mx-auto space-y-6">

        {/* Header */}
        <div className="text-center space-y-2">
          <div className="flex items-center justify-center gap-2 mb-4">
            <Sparkles className="h-5 w-5 text-violet-500" />
            <span className="text-sm font-semibold text-violet-600 uppercase tracking-wide">RecruiterStack</span>
          </div>
          {info.ticket_number && (
            <p className="text-xs font-mono font-semibold text-slate-400">{info.ticket_number}</p>
          )}
          <h1 className="text-2xl font-bold text-slate-900">{info.position_title}</h1>
          {info.department && <p className="text-sm text-slate-500">{info.department}</p>}
        </div>

        {/* Status card */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-5">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Request Progress</p>

          <div className="space-y-4">
            {STEPS.map((step, i) => {
              const isDone = step.doneStatuses.includes(info.status)
              const isActive = step.activeStatuses?.includes(info.status) ?? false

              return (
                <div key={step.key} className="flex items-start gap-4">
                  {/* Icon */}
                  <div className={`mt-0.5 h-6 w-6 rounded-full flex items-center justify-center shrink-0 ${
                    isDone ? 'bg-emerald-100' : isActive ? 'bg-blue-100' : 'bg-slate-100'
                  }`}>
                    {isDone
                      ? <CheckCircle className="h-4 w-4 text-emerald-500" />
                      : isActive
                        ? <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />
                        : i === STEPS.length - 1
                          ? <Send className="h-3.5 w-3.5 text-slate-300" />
                          : <Clock className="h-3.5 w-3.5 text-slate-300" />
                    }
                  </div>
                  {/* Text */}
                  <div className="flex-1">
                    <p className={`text-sm font-semibold ${isDone ? 'text-slate-800' : isActive ? 'text-blue-700' : 'text-slate-400'}`}>
                      {step.label}
                    </p>
                    <p className={`text-xs mt-0.5 ${isDone || isActive ? 'text-slate-500' : 'text-slate-300'}`}>
                      {step.sub}
                    </p>
                    {/* Date stamps */}
                    {step.key === 'created' && (
                      <p className="text-xs text-slate-400 mt-1">{fmt(info.created_at)}</p>
                    )}
                    {step.key === 'submitted' && info.intake_submitted_at && (
                      <p className="text-xs text-slate-400 mt-1">{fmt(info.intake_submitted_at)}</p>
                    )}
                    {step.key === 'jd_ready' && info.jd_sent_at && isDone && (
                      <p className="text-xs text-slate-400 mt-1">{fmt(info.jd_sent_at)}</p>
                    )}
                  </div>
                  {/* Connector line */}
                  {i < STEPS.length - 1 && (
                    <div className="absolute ml-3 mt-7 w-px h-6 bg-slate-100" />
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Active status message */}
        {info.status === 'intake_pending' && (
          <div className="rounded-xl bg-amber-50 border border-amber-200 p-4 text-sm text-amber-700">
            <strong>Action needed:</strong> Your intake form is still waiting to be filled in.
            {' '}<a href={`/intake/${token}`} className="underline font-semibold">Fill it in now →</a>
          </div>
        )}
        {info.status === 'jd_approved' && (
          <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-4 text-sm text-emerald-700">
            The JD is with your recruiter and ready to be posted. You&apos;ll hear from them once it goes live.
          </div>
        )}
        {info.status === 'posted' && (
          <div className="rounded-xl bg-blue-50 border border-blue-200 p-4 text-sm text-blue-700 flex items-center gap-2">
            <CheckCircle className="h-4 w-4 text-blue-500 shrink-0" />
            This position is live and accepting applications.
          </div>
        )}

        <p className="text-xs text-slate-400 text-center pb-4">
          This page updates automatically as your recruiter moves the request forward.
        </p>
      </div>
    </div>
  )
}
