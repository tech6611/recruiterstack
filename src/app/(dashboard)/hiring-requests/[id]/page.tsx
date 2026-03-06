'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
  ArrowLeft, Loader2, CheckCircle, Clock, Copy, Check,
  ExternalLink, MapPin, Users, Calendar, FileText,
  Globe, Briefcase,
} from 'lucide-react'
import type { HiringRequest } from '@/lib/types/database'

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  intake_pending:   { label: 'Awaiting HM',      color: 'bg-amber-50 text-amber-700 border-amber-200' },
  intake_submitted: { label: 'Intake Received',  color: 'bg-blue-50 text-blue-700 border-blue-200' },
  jd_generated:    { label: 'JD Generated',      color: 'bg-violet-50 text-violet-700 border-violet-200' },
  jd_sent:         { label: 'JD Sent',           color: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  jd_approved:     { label: 'JD Ready — Review', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  posted:          { label: 'Posted',            color: 'bg-slate-100 text-slate-600 border-slate-200' },
}

const JOB_BOARDS = [
  { name: 'LinkedIn', icon: '💼', color: 'bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100' },
  { name: 'Indeed', icon: '🔍', color: 'bg-indigo-50 border-indigo-200 text-indigo-700 hover:bg-indigo-100' },
  { name: 'Greenhouse', icon: '🌱', color: 'bg-green-50 border-green-200 text-green-700 hover:bg-green-100' },
  { name: 'Lever', icon: '⚙️', color: 'bg-orange-50 border-orange-200 text-orange-700 hover:bg-orange-100' },
  { name: 'Wellfound', icon: '🚀', color: 'bg-violet-50 border-violet-200 text-violet-700 hover:bg-violet-100' },
  { name: 'Custom Board', icon: '🌐', color: 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100' },
]

export default function HiringRequestDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()

  const [request, setRequest] = useState<HiringRequest | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [copiedJD, setCopiedJD] = useState(false)
  const [markingPosted, setMarkingPosted] = useState(false)
  const [connectingBoard, setConnectingBoard] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/hiring-requests/${id}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) setError(d.error)
        else setRequest(d.data)
        setLoading(false)
      })
      .catch(() => { setError('Failed to load.'); setLoading(false) })
  }, [id])

  const handleMarkPosted = async () => {
    if (!request) return
    setMarkingPosted(true)
    const res = await fetch(`/api/hiring-requests/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'posted' }),
    })
    const json = await res.json()
    setMarkingPosted(false)
    if (res.ok) setRequest(json.data)
  }

  const copyJD = () => {
    if (!request?.generated_jd) return
    navigator.clipboard.writeText(request.generated_jd)
    setCopiedJD(true); setTimeout(() => setCopiedJD(false), 2000)
  }

  const handleBoardConnect = (boardName: string) => {
    setConnectingBoard(boardName)
    setTimeout(() => setConnectingBoard(null), 3000)
  }

  if (loading) return (
    <div className="flex items-center justify-center min-h-screen">
      <Loader2 className="h-6 w-6 animate-spin text-slate-300" />
    </div>
  )

  if (error || !request) return (
    <div className="p-8">
      <button onClick={() => router.back()} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 mb-4">
        <ArrowLeft className="h-4 w-4" />Back
      </button>
      <p className="text-sm text-red-500">{error ?? 'Request not found.'}</p>
    </div>
  )

  const s = STATUS_LABELS[request.status] ?? STATUS_LABELS.intake_pending

  return (
    <div className="p-8 max-w-4xl space-y-6">

      {/* Header */}
      <div>
        <button onClick={() => router.back()} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 mb-4 transition-colors">
          <ArrowLeft className="h-4 w-4" />Back to Hiring Requests
        </button>
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <span className="text-xs font-mono font-semibold text-slate-400">{request.ticket_number ?? '—'}</span>
              <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${s.color}`}>
                {s.label}
              </span>
            </div>
            <h1 className="text-2xl font-bold text-slate-900">{request.position_title}</h1>
            {request.department && <p className="text-sm text-slate-500 mt-0.5">{request.department}</p>}
          </div>
          {request.status === 'jd_approved' && (
            <button
              onClick={handleMarkPosted}
              disabled={markingPosted}
              className="flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60 transition-colors shrink-0"
            >
              {markingPosted ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
              Mark as Posted
            </button>
          )}
        </div>
      </div>

      {/* Overview cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { icon: <Users className="h-4 w-4" />, label: 'Hiring Manager', value: request.hiring_manager_name },
          { icon: <MapPin className="h-4 w-4" />, label: 'Location', value: request.location ? `${request.location}${request.remote_ok ? ' · Remote OK' : ''}` : request.remote_ok ? 'Remote' : '—' },
          { icon: <Briefcase className="h-4 w-4" />, label: 'Openings', value: `${request.headcount} ${request.headcount === 1 ? 'opening' : 'openings'}${request.level ? ` · ${request.level}` : ''}` },
          { icon: <Calendar className="h-4 w-4" />, label: 'Created', value: new Date(request.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) },
        ].map(item => (
          <div key={item.label} className="rounded-xl border border-slate-200 bg-white p-3.5">
            <div className="flex items-center gap-1.5 text-slate-400 mb-1.5">{item.icon}<span className="text-xs">{item.label}</span></div>
            <p className="text-sm font-semibold text-slate-800 leading-snug">{item.value}</p>
          </div>
        ))}
      </div>

      {/* Compensation */}
      {(request.budget_min || request.budget_max || request.target_start_date) && (
        <div className="rounded-xl border border-slate-200 bg-white p-5 flex flex-wrap gap-6">
          {(request.budget_min || request.budget_max) && (
            <div>
              <p className="text-xs text-slate-400 mb-1">Salary Range</p>
              <p className="text-sm font-semibold text-slate-800">
                {request.budget_min ? `$${request.budget_min.toLocaleString()}` : '—'}
                {' – '}
                {request.budget_max ? `$${request.budget_max.toLocaleString()}` : '—'}
              </p>
            </div>
          )}
          {request.target_start_date && (
            <div>
              <p className="text-xs text-slate-400 mb-1">Target Start</p>
              <p className="text-sm font-semibold text-slate-800">{request.target_start_date}</p>
            </div>
          )}
        </div>
      )}

      {/* JD */}
      {request.generated_jd ? (
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100 bg-slate-50">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-slate-400" />
              <span className="text-sm font-semibold text-slate-800">Job Description</span>
            </div>
            <button
              onClick={copyJD}
              className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800 transition-colors"
            >
              {copiedJD ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
              {copiedJD ? 'Copied!' : 'Copy JD'}
            </button>
          </div>
          <div className="p-5 max-h-96 overflow-y-auto">
            <pre className="whitespace-pre-wrap text-sm text-slate-700 font-sans leading-relaxed">{request.generated_jd}</pre>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center">
          <Clock className="h-8 w-8 text-slate-200 mx-auto mb-2" />
          <p className="text-sm text-slate-400">JD not yet available — waiting for the hiring manager to complete the intake form.</p>
        </div>
      )}

      {/* Intake Details */}
      {(request.key_requirements || request.team_context || request.nice_to_haves || request.target_companies) && (
        <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Intake Details</p>
          {request.team_context && (
            <div>
              <p className="text-xs font-semibold text-slate-600 mb-1">Team & Role Context</p>
              <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-wrap">{request.team_context}</p>
            </div>
          )}
          {request.key_requirements && (
            <div>
              <p className="text-xs font-semibold text-slate-600 mb-1">Key Requirements</p>
              <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-wrap">{request.key_requirements}</p>
            </div>
          )}
          {request.nice_to_haves && (
            <div>
              <p className="text-xs font-semibold text-slate-600 mb-1">Nice to Have</p>
              <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-wrap">{request.nice_to_haves}</p>
            </div>
          )}
          {request.target_companies && (
            <div>
              <p className="text-xs font-semibold text-slate-600 mb-1">Target Companies</p>
              <div className="flex flex-wrap gap-2 mt-1">
                {request.target_companies.split(',').map(c => c.trim()).filter(Boolean).map(c => (
                  <span key={c} className="rounded-full bg-slate-100 border border-slate-200 text-slate-700 text-xs px-2.5 py-1">{c}</span>
                ))}
              </div>
            </div>
          )}
          {request.additional_notes && (
            <div>
              <p className="text-xs font-semibold text-slate-600 mb-1">Additional Notes</p>
              <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-wrap">{request.additional_notes}</p>
            </div>
          )}
        </div>
      )}

      {/* Job Board Push */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <Globe className="h-4 w-4 text-slate-400" />
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Push to Job Boards</p>
          </div>
          <p className="text-xs text-slate-400 mt-1">Connect your accounts to post this JD with one click.</p>
        </div>

        {connectingBoard && (
          <div className="rounded-xl bg-blue-50 border border-blue-200 px-4 py-3 text-sm text-blue-700">
            <strong>{connectingBoard}</strong> integration is coming soon. In the meantime, copy the JD above and post manually.
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {JOB_BOARDS.map(board => (
            <button
              key={board.name}
              onClick={() => handleBoardConnect(board.name)}
              className={`flex items-center gap-2.5 rounded-xl border px-4 py-3 text-sm font-semibold transition-colors ${board.color}`}
            >
              <span className="text-base">{board.icon}</span>
              <span>{board.name}</span>
              <ExternalLink className="h-3.5 w-3.5 ml-auto opacity-50" />
            </button>
          ))}
        </div>

        <p className="text-xs text-slate-400">
          All integrations show <strong>Connect</strong> — wiring up posting logic is the next build step.
        </p>
      </div>

      {/* Posted confirmation */}
      {request.status === 'posted' && (
        <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-4 flex items-center gap-3">
          <CheckCircle className="h-5 w-5 text-emerald-500 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-emerald-800">This position has been marked as posted.</p>
            {request.jd_sent_at && (
              <p className="text-xs text-emerald-600 mt-0.5">
                Submitted {new Date(request.jd_sent_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
              </p>
            )}
          </div>
        </div>
      )}

    </div>
  )
}
