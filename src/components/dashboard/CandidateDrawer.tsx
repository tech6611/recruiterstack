'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import {
  X,
  ExternalLink,
  Mail,
  Phone,
  MapPin,
  Briefcase,
  Clock,
  Star,
  ArrowRight,
  Loader2,
  User,
  Linkedin,
  ChevronDown,
  ChevronUp,
  Send,
  Zap,
  CheckCircle2,
  XCircle,
} from 'lucide-react'

// ── Types ─────────────────────────────────────────────────────────────────────

interface CandidateDetail {
  id: string
  name: string
  email: string | null
  phone: string | null
  location: string | null
  current_title: string | null
  experience_years: number | null
  skills: string[] | null
  linkedin_url: string | null
  status: string
  ai_summary: string | null
  ai_summary_generated_at: string | null
}

interface PipelineStage {
  id: string
  name: string
  color: string
  order_index: number
}

interface ApplicationBrief {
  id: string
  status: string
  stage_id: string | null
  stage_name: string | null
  hiring_request_id: string | null
  job_title: string | null
  department: string | null
  ai_score: number | null
  ai_recommendation: string | null
  applied_at: string | null
}

interface DrawerData {
  candidate: CandidateDetail
  applications: ApplicationBrief[]
  stagesByJob: Record<string, PipelineStage[]>
}

interface CandidateDrawerProps {
  candidateId: string | null
  onClose: () => void
  onActionComplete?: () => void
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1)  return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24)  return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 7)  return `${days}d ago`
  const wks = Math.floor(days / 7)
  return wks < 52 ? `${wks}w ago` : `${Math.floor(wks / 52)}y ago`
}

const STATUS_STYLES: Record<string, string> = {
  active:       'bg-emerald-100 text-emerald-700',
  hired:        'bg-green-100 text-green-700',
  rejected:     'bg-red-100 text-red-700',
  withdrawn:    'bg-slate-100 text-slate-600',
  interviewing: 'bg-amber-100 text-amber-700',
  offer_extended: 'bg-violet-100 text-violet-700',
  inactive:     'bg-slate-100 text-slate-500',
}

const RECO_STYLES: Record<string, { label: string; cls: string }> = {
  strong_yes: { label: 'Strong Yes', cls: 'bg-emerald-100 text-emerald-700' },
  yes:        { label: 'Yes',        cls: 'bg-green-100 text-green-700' },
  maybe:      { label: 'Maybe',      cls: 'bg-amber-100 text-amber-700' },
  no:         { label: 'No',         cls: 'bg-red-100 text-red-700' },
}

// ── Quick Action: Add Note ────────────────────────────────────────────────────

function AddNoteAction({ applicationId, onDone }: { applicationId: string; onDone: () => void }) {
  const [note, setNote]       = useState('')
  const [saving, setSaving]   = useState(false)

  async function handleSubmit() {
    if (!note.trim()) return
    setSaving(true)
    try {
      await fetch(`/api/applications/${applicationId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: note.trim() }),
      })
      setNote('')
      onDone()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex gap-2">
      <input
        type="text"
        value={note}
        onChange={e => setNote(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && handleSubmit()}
        placeholder="Add a note..."
        className="flex-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-700 placeholder:text-slate-400 focus:border-blue-300 focus:outline-none"
      />
      <button
        onClick={handleSubmit}
        disabled={!note.trim() || saving}
        className="rounded-lg bg-blue-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
      >
        {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
      </button>
    </div>
  )
}

// ── Quick Action: Move Stage ──────────────────────────────────────────────────

function MoveStageAction({
  applicationId, currentStageId, stages, onDone,
}: {
  applicationId: string; currentStageId: string | null; stages: PipelineStage[]; onDone: () => void
}) {
  const [saving, setSaving] = useState(false)

  async function moveTo(stageId: string) {
    setSaving(true)
    try {
      await fetch(`/api/applications/${applicationId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage_id: stageId }),
      })
      onDone()
    } finally {
      setSaving(false)
    }
  }

  if (stages.length === 0) return null

  return (
    <div className="flex flex-wrap gap-1.5">
      {stages.map(stage => {
        const isCurrent = stage.id === currentStageId
        return (
          <button
            key={stage.id}
            onClick={() => !isCurrent && moveTo(stage.id)}
            disabled={isCurrent || saving}
            className={`rounded-full px-2 py-0.5 text-[10px] font-medium transition-colors ${
              isCurrent
                ? 'bg-blue-100 text-blue-700 ring-1 ring-blue-300'
                : 'bg-slate-100 text-slate-600 hover:bg-blue-50 hover:text-blue-600'
            } disabled:cursor-default`}
          >
            {stage.name}
          </button>
        )
      })}
    </div>
  )
}

// ── Quick Action: Send Quick Email ────────────────────────────────────────────

function QuickEmailAction({
  applicationId, candidateEmail, candidateName, onDone,
}: {
  applicationId: string; candidateEmail: string; candidateName: string; onDone: () => void
}) {
  const [open, setOpen]       = useState(false)
  const [subject, setSubject] = useState('')
  const [body, setBody]       = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent]       = useState(false)

  async function handleSend() {
    if (!subject.trim() || !body.trim()) return
    setSending(true)
    try {
      await fetch(`/api/applications/${applicationId}/send-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: candidateEmail,
          subject: subject.trim(),
          html: body.trim().replace(/\n/g, '<br>'),
        }),
      })
      setSent(true)
      setTimeout(() => { setSent(false); setOpen(false); setSubject(''); setBody(''); onDone() }, 1500)
    } finally {
      setSending(false)
    }
  }

  if (sent) {
    return (
      <div className="flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
        <CheckCircle2 className="h-3.5 w-3.5" /> Email sent to {candidateName}
      </div>
    )
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-600 hover:bg-slate-50 transition-colors"
      >
        <Mail className="h-3 w-3" /> Email {candidateName.split(' ')[0]}
      </button>
    )
  }

  return (
    <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
      <input
        type="text"
        value={subject}
        onChange={e => setSubject(e.target.value)}
        placeholder="Subject"
        className="w-full rounded border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 placeholder:text-slate-400 focus:border-blue-300 focus:outline-none"
      />
      <textarea
        value={body}
        onChange={e => setBody(e.target.value)}
        placeholder={`Hi ${candidateName.split(' ')[0]},...`}
        rows={3}
        className="w-full rounded border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 placeholder:text-slate-400 focus:border-blue-300 focus:outline-none resize-none"
      />
      <div className="flex items-center gap-2">
        <button
          onClick={handleSend}
          disabled={!subject.trim() || !body.trim() || sending}
          className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {sending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
          Send
        </button>
        <button onClick={() => setOpen(false)} className="text-xs text-slate-400 hover:text-slate-600">
          Cancel
        </button>
      </div>
    </div>
  )
}

// ── Quick Action: Reject ──────────────────────────────────────────────────────

function RejectAction({ applicationId, onDone }: { applicationId: string; onDone: () => void }) {
  const [confirming, setConfirming] = useState(false)
  const [saving, setSaving]         = useState(false)

  async function handleReject() {
    setSaving(true)
    try {
      await fetch(`/api/applications/${applicationId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'rejected' }),
      })
      onDone()
    } finally {
      setSaving(false)
      setConfirming(false)
    }
  }

  if (confirming) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-red-500">Reject this candidate?</span>
        <button onClick={handleReject} disabled={saving}
          className="rounded bg-red-500 px-2 py-0.5 text-[10px] font-medium text-white hover:bg-red-600 disabled:opacity-50">
          {saving ? 'Rejecting...' : 'Confirm'}
        </button>
        <button onClick={() => setConfirming(false)} className="text-[10px] text-slate-400 hover:text-slate-600">
          Cancel
        </button>
      </div>
    )
  }

  return (
    <button
      onClick={() => setConfirming(true)}
      className="flex items-center gap-1 rounded-lg border border-red-200 px-2.5 py-1.5 text-xs text-red-500 hover:bg-red-50 transition-colors"
    >
      <XCircle className="h-3 w-3" /> Reject
    </button>
  )
}

// ── Application Card with Actions ─────────────────────────────────────────────

function ApplicationCard({
  app, stages, candidateEmail, candidateName, onRefresh,
}: {
  app: ApplicationBrief
  stages: PipelineStage[]
  candidateEmail: string | null
  candidateName: string
  onRefresh: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const isActive = app.status === 'active'

  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-medium text-slate-800 truncate">{app.job_title ?? 'Unknown role'}</p>
          {app.department && (
            <p className="text-[10px] text-slate-400">{app.department}</p>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${STATUS_STYLES[app.status] ?? 'bg-slate-100 text-slate-600'}`}>
            {app.status}
          </span>
          {isActive && (
            <button onClick={() => setExpanded(!expanded)}
              className="rounded p-0.5 text-slate-400 hover:bg-slate-200 hover:text-slate-600 transition-colors">
              {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </button>
          )}
        </div>
      </div>

      <div className="mt-2 flex items-center gap-3 text-[10px] text-slate-500">
        {app.stage_name && (
          <span className="flex items-center gap-1">
            <ArrowRight className="h-2.5 w-2.5" /> {app.stage_name}
          </span>
        )}
        {app.applied_at && (
          <span className="flex items-center gap-1">
            <Clock className="h-2.5 w-2.5" /> {timeAgo(app.applied_at)}
          </span>
        )}
      </div>

      {(app.ai_score !== null || app.ai_recommendation) && (
        <div className="mt-2 flex items-center gap-2">
          {app.ai_score !== null && (
            <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
              app.ai_score >= 80 ? 'bg-emerald-100 text-emerald-700' :
              app.ai_score >= 60 ? 'bg-amber-100 text-amber-700' :
              'bg-slate-100 text-slate-600'
            }`}>
              <Star className="inline h-2.5 w-2.5 mr-0.5" />{app.ai_score}/100
            </span>
          )}
          {app.ai_recommendation && RECO_STYLES[app.ai_recommendation] && (
            <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${RECO_STYLES[app.ai_recommendation].cls}`}>
              {RECO_STYLES[app.ai_recommendation].label}
            </span>
          )}
        </div>
      )}

      {/* Expanded actions */}
      {expanded && isActive && (
        <div className="mt-3 space-y-2.5 border-t border-slate-200 pt-3">
          {/* Move stage */}
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">Move to stage</p>
            <MoveStageAction
              applicationId={app.id}
              currentStageId={app.stage_id}
              stages={stages}
              onDone={onRefresh}
            />
          </div>

          {/* Add note */}
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">Quick note</p>
            <AddNoteAction applicationId={app.id} onDone={onRefresh} />
          </div>

          {/* Email + Reject */}
          <div className="flex items-center gap-2">
            {candidateEmail && (
              <QuickEmailAction
                applicationId={app.id}
                candidateEmail={candidateEmail}
                candidateName={candidateName}
                onDone={onRefresh}
              />
            )}
            <RejectAction applicationId={app.id} onDone={onRefresh} />
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

export function CandidateDrawer({ candidateId, onClose, onActionComplete }: CandidateDrawerProps) {
  const [data, setData]       = useState<DrawerData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)
  const [scoringAppId, setScoringAppId] = useState<string | null>(null)
  const [scoreStatus, setScoreStatus]   = useState<'idle' | 'scoring' | 'done'>('idle')

  const fetchCandidate = useCallback(async (id: string) => {
    setLoading(true)
    setError(null)
    setData(null)
    try {
      const [candRes, appsRes] = await Promise.all([
        fetch(`/api/candidates/${id}`),
        fetch(`/api/applications?candidate_id=${id}`),
      ])
      if (!candRes.ok) throw new Error('Failed to load candidate')
      const candJson = await candRes.json()
      const appsJson = appsRes.ok ? await appsRes.json() : { data: [] }

      const candidate = candJson.data ?? candJson
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const apps: ApplicationBrief[] = (appsJson.data ?? []).map((a: any) => ({
        id: a.id,
        status: a.status,
        stage_id: a.stage_id ?? null,
        stage_name: a.pipeline_stages?.name ?? a.stage_name ?? null,
        hiring_request_id: a.hiring_request_id ?? null,
        job_title: a.hiring_requests?.position_title ?? a.hiring_request?.position_title ?? a.job_title ?? null,
        department: a.hiring_requests?.department ?? a.hiring_request?.department ?? null,
        ai_score: a.ai_score ?? null,
        ai_recommendation: a.ai_recommendation ?? null,
        applied_at: a.applied_at ?? a.created_at ?? null,
      }))

      // Fetch pipeline stages for each job
      const jobIds = Array.from(new Set(apps.map(a => a.hiring_request_id).filter(Boolean))) as string[]
      const stagesByJob: Record<string, PipelineStage[]> = {}

      if (jobIds.length > 0) {
        const stagesRes = await fetch(`/api/jobs/${jobIds[0]}/stages`)
        if (stagesRes.ok) {
          const stagesJson = await stagesRes.json()
          stagesByJob[jobIds[0]] = (stagesJson.data ?? []).sort(
            (a: PipelineStage, b: PipelineStage) => a.order_index - b.order_index
          )
        }
        // Fetch remaining jobs in parallel
        if (jobIds.length > 1) {
          const remaining = await Promise.all(
            jobIds.slice(1).map(async jid => {
              const res = await fetch(`/api/jobs/${jid}/stages`)
              if (!res.ok) return { jid, stages: [] }
              const json = await res.json()
              return { jid, stages: (json.data ?? []).sort((a: PipelineStage, b: PipelineStage) => a.order_index - b.order_index) }
            })
          )
          remaining.forEach(r => { stagesByJob[r.jid] = r.stages })
        }
      }

      setData({ candidate, applications: apps, stagesByJob })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (candidateId) fetchCandidate(candidateId)
  }, [candidateId, fetchCandidate])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  function handleRefresh() {
    if (candidateId) fetchCandidate(candidateId)
    onActionComplete?.()
  }

  // AI Score trigger
  async function handleScoreApplication(appId: string, jobId: string) {
    setScoringAppId(appId)
    setScoreStatus('scoring')
    try {
      await fetch(`/api/jobs/${jobId}/score`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ application_id: appId }),
      })
      setScoreStatus('done')
      setTimeout(() => { setScoreStatus('idle'); setScoringAppId(null); handleRefresh() }, 1500)
    } catch {
      setScoreStatus('idle')
      setScoringAppId(null)
    }
  }

  if (!candidateId) return null

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm transition-opacity" onClick={onClose} />
      <div className="absolute right-0 top-0 bottom-0 w-full max-w-md bg-white shadow-2xl flex flex-col animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200">
          <h2 className="text-sm font-semibold text-slate-900">Quick View</h2>
          <button onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {loading && (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
            </div>
          )}

          {error && (
            <div className="px-5 py-10 text-center">
              <p className="text-sm text-red-500">{error}</p>
              <button onClick={() => fetchCandidate(candidateId)} className="mt-2 text-xs text-blue-500 hover:underline">Retry</button>
            </div>
          )}

          {data && (
            <div>
              {/* Profile header */}
              <div className="px-5 py-4 border-b border-slate-100">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-100 text-sm font-bold text-blue-600">
                    {data.candidate.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-semibold text-slate-900 truncate">{data.candidate.name}</h3>
                    {data.candidate.current_title && (
                      <p className="text-xs text-slate-500 truncate">{data.candidate.current_title}</p>
                    )}
                    <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${STATUS_STYLES[data.candidate.status] ?? 'bg-slate-100 text-slate-600'}`}>
                      {data.candidate.status.replace('_', ' ')}
                    </span>
                  </div>
                </div>

                {/* Contact info */}
                <div className="mt-3 space-y-1.5">
                  {data.candidate.email && (
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <Mail className="h-3 w-3 text-slate-400" />
                      <span className="truncate">{data.candidate.email}</span>
                    </div>
                  )}
                  {data.candidate.phone && (
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <Phone className="h-3 w-3 text-slate-400" />
                      <span>{data.candidate.phone}</span>
                    </div>
                  )}
                  {data.candidate.location && (
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <MapPin className="h-3 w-3 text-slate-400" />
                      <span>{data.candidate.location}</span>
                    </div>
                  )}
                  {data.candidate.experience_years !== null && (
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <Briefcase className="h-3 w-3 text-slate-400" />
                      <span>{data.candidate.experience_years} years experience</span>
                    </div>
                  )}
                  {data.candidate.linkedin_url && (
                    <a href={data.candidate.linkedin_url} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-2 text-xs text-blue-500 hover:underline">
                      <Linkedin className="h-3 w-3" />
                      <span>LinkedIn Profile</span>
                    </a>
                  )}
                </div>
              </div>

              {/* Skills */}
              {data.candidate.skills && data.candidate.skills.length > 0 && (
                <div className="px-5 py-3 border-b border-slate-100">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-2">Skills</p>
                  <div className="flex flex-wrap gap-1.5">
                    {data.candidate.skills.slice(0, 8).map(skill => (
                      <span key={skill} className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">
                        {skill}
                      </span>
                    ))}
                    {data.candidate.skills.length > 8 && (
                      <span className="rounded-full bg-slate-50 px-2 py-0.5 text-[10px] text-slate-400">
                        +{data.candidate.skills.length - 8} more
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* AI Summary */}
              {data.candidate.ai_summary && (
                <div className="px-5 py-3 border-b border-slate-100">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-2">AI Summary</p>
                  <p className="text-xs text-slate-600 leading-relaxed line-clamp-4">
                    {data.candidate.ai_summary}
                  </p>
                </div>
              )}

              {/* Applications with actions */}
              <div className="px-5 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-2">
                  Applications ({data.applications.length})
                </p>
                {data.applications.length === 0 ? (
                  <p className="text-xs text-slate-400">No applications yet.</p>
                ) : (
                  <div className="space-y-2">
                    {data.applications.map(app => (
                      <div key={app.id}>
                        <ApplicationCard
                          app={app}
                          stages={app.hiring_request_id ? (data.stagesByJob[app.hiring_request_id] ?? []) : []}
                          candidateEmail={data.candidate.email}
                          candidateName={data.candidate.name}
                          onRefresh={handleRefresh}
                        />
                        {/* AI Score button for unscored active applications */}
                        {app.status === 'active' && app.ai_score === null && app.hiring_request_id && (
                          <button
                            onClick={() => handleScoreApplication(app.id, app.hiring_request_id!)}
                            disabled={scoringAppId === app.id}
                            className="mt-1 flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-amber-200 bg-amber-50 py-1.5 text-[10px] font-medium text-amber-700 hover:bg-amber-100 disabled:opacity-60 transition-colors"
                          >
                            {scoringAppId === app.id ? (
                              scoreStatus === 'done'
                                ? <><CheckCircle2 className="h-3 w-3 text-emerald-600" /> Scored!</>
                                : <><Loader2 className="h-3 w-3 animate-spin" /> Scoring with AI...</>
                            ) : (
                              <><Zap className="h-3 w-3" /> AI Score this candidate</>
                            )}
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {data && (
          <div className="border-t border-slate-200 px-5 py-3">
            <Link href={`/candidates/${candidateId}`}
              className="flex items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-xs font-medium text-white hover:bg-slate-800 transition-colors">
              <User className="h-3.5 w-3.5" />
              View full profile
              <ExternalLink className="h-3 w-3" />
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}
