'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
  ArrowLeft, Mail, Phone, MapPin, Briefcase, ExternalLink,
  FileText, Send, Clock, ChevronRight, Loader2, AlertCircle,
  Pencil, Check, X, Plus, Linkedin,
} from 'lucide-react'
import type { Candidate, Application, ApplicationEvent } from '@/lib/types/database'

// ── Helpers ───────────────────────────────────────────────────────────────────

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
function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}
function fmtRelative(d: string) {
  const diff = Date.now() - new Date(d).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

const EVENT_CONFIG: Record<string, { label: (e: ApplicationEvent) => string; icon: React.ReactNode; color: string }> = {
  applied: {
    label: e => `Applied · entered ${e.to_stage ?? 'pipeline'}`,
    icon: <Send className="h-3.5 w-3.5" />,
    color: 'bg-blue-50 text-blue-600',
  },
  stage_moved: {
    label: e => `Moved to ${e.to_stage ?? '?'}${e.from_stage ? ` from ${e.from_stage}` : ''}`,
    icon: <ChevronRight className="h-3.5 w-3.5" />,
    color: 'bg-violet-50 text-violet-600',
  },
  note_added: {
    label: () => 'Note added',
    icon: <FileText className="h-3.5 w-3.5" />,
    color: 'bg-amber-50 text-amber-600',
  },
  status_changed: {
    label: e => `Status → ${e.to_stage ?? '?'}`,
    icon: <AlertCircle className="h-3.5 w-3.5" />,
    color: 'bg-slate-100 text-slate-600',
  },
}

const STAGE_COLOR_MAP: Record<string, string> = {
  slate:   'bg-slate-100 text-slate-700',
  blue:    'bg-blue-50 text-blue-700',
  violet:  'bg-violet-50 text-violet-700',
  amber:   'bg-amber-50 text-amber-700',
  emerald: 'bg-emerald-50 text-emerald-700',
  green:   'bg-green-50 text-green-700',
  red:     'bg-red-50 text-red-700',
  pink:    'bg-pink-50 text-pink-700',
}

// ── Page ──────────────────────────────────────────────────────────────────────

interface CandidateWithPipeline extends Candidate {
  applications: (Application & {
    pipeline_stages: { name: string; color: string } | null
    hiring_requests: { id: string; position_title: string; department: string | null; ticket_number: string | null } | null
  })[]
  events: (ApplicationEvent & { application_id: string })[]
}

type JobOption = { id: string; position_title: string; department: string | null; ticket_number: string | null }

export default function CandidateProfilePage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()

  const [candidate, setCandidate] = useState<CandidateWithPipeline | null>(null)
  const [loading, setLoading] = useState(true)
  const [note, setNote] = useState('')
  const [savingNote, setSavingNote] = useState(false)
  const [editSkills, setEditSkills] = useState(false)
  const [skillInput, setSkillInput] = useState('')

  // LinkedIn edit
  const [editLinkedin, setEditLinkedin] = useState(false)
  const [linkedinInput, setLinkedinInput] = useState('')

  // Add to Job modal
  const [showAddToJob, setShowAddToJob] = useState(false)
  const [jobs, setJobs] = useState<JobOption[]>([])
  const [addingToJob, setAddingToJob] = useState<string | null>(null)
  const [jobsLoading, setJobsLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch(`/api/candidates/${id}`)
    const json = await res.json()
    setCandidate(json.data ?? null)
    setLoading(false)
  }, [id])

  useEffect(() => { load() }, [load])

  const addNote = async (applicationId: string) => {
    if (!note.trim()) return
    setSavingNote(true)
    await fetch(`/api/applications/${applicationId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ note: note.trim() }),
    })
    setNote('')
    setSavingNote(false)
    await load()
  }

  const changeStatus = async (appId: string, status: string) => {
    if (!confirm(`Mark this application as ${status}?`)) return
    await fetch(`/api/applications/${appId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    await load()
  }

  const saveLinkedin = async () => {
    const val = linkedinInput.trim()
    const normalized = val && !val.startsWith('http') ? `https://${val}` : val || null
    await fetch(`/api/candidates/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ linkedin_url: normalized }),
    })
    setEditLinkedin(false)
    await load()
  }

  const openAddToJob = async () => {
    setShowAddToJob(true)
    setJobsLoading(true)
    const res = await fetch('/api/jobs')
    if (res.ok) {
      const json = await res.json()
      setJobs(json.data ?? [])
    }
    setJobsLoading(false)
  }

  const addToJob = async (hiringRequestId: string) => {
    setAddingToJob(hiringRequestId)
    const res = await fetch('/api/applications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ candidate_id: id, hiring_request_id: hiringRequestId, source: 'manual' }),
    })
    setAddingToJob(null)
    if (res.ok || res.status === 409) {
      setShowAddToJob(false)
      await load()
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-slate-400 text-sm gap-2">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading profile…
      </div>
    )
  }

  if (!candidate) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-slate-400 text-sm gap-2">
        <AlertCircle className="h-6 w-6" />
        Candidate not found.
      </div>
    )
  }

  const activeApps = candidate.applications.filter(a => a.status === 'active')
  const closedApps  = candidate.applications.filter(a => a.status !== 'active')

  // Jobs the candidate is NOT already in
  const existingJobIds = new Set(candidate.applications.map(a => a.hiring_request_id))
  const availableJobs  = jobs.filter(j => !existingJobIds.has(j.id))

  return (
    <div className="flex flex-col min-h-full">
      {/* Back + Add to Job */}
      <div className="px-8 pt-6 pb-4 flex items-center justify-between">
        <button
          onClick={() => router.push('/candidates')}
          className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Candidates
        </button>
        <button
          onClick={openAddToJob}
          className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition-colors shadow-sm"
        >
          <Plus className="h-3.5 w-3.5" />
          Add to Job
        </button>
      </div>

      <div className="flex gap-6 px-8 pb-10 items-start">
        {/* ── Left sidebar ─────────────────────────────────────────────────── */}
        <div className="w-64 shrink-0 space-y-5 sticky top-6">
          {/* Avatar + name */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-col items-center text-center mb-4">
              <div className={`h-16 w-16 rounded-full flex items-center justify-center text-xl font-bold mb-3 ${avatarColor(candidate.name)}`}>
                {initials(candidate.name)}
              </div>
              <h1 className="text-lg font-bold text-slate-900">{candidate.name}</h1>
              {candidate.current_title && (
                <p className="text-sm text-slate-500 mt-0.5">{candidate.current_title}</p>
              )}
            </div>

            {/* Contact */}
            <div className="space-y-2.5 text-sm">
              <a
                href={`mailto:${candidate.email}`}
                className="flex items-center gap-2.5 text-blue-600 hover:text-blue-800 transition-colors"
              >
                <Mail className="h-4 w-4 shrink-0 text-slate-400" />
                <span className="truncate">{candidate.email}</span>
              </a>
              {candidate.phone && (
                <div className="flex items-center gap-2.5 text-slate-600">
                  <Phone className="h-4 w-4 shrink-0 text-slate-400" />
                  <span>{candidate.phone}</span>
                </div>
              )}
              {candidate.location && (
                <div className="flex items-center gap-2.5 text-slate-600">
                  <MapPin className="h-4 w-4 shrink-0 text-slate-400" />
                  <span>{candidate.location}</span>
                </div>
              )}
              {candidate.experience_years > 0 && (
                <div className="flex items-center gap-2.5 text-slate-600">
                  <Briefcase className="h-4 w-4 shrink-0 text-slate-400" />
                  <span>{candidate.experience_years} yrs experience</span>
                </div>
              )}
              {candidate.resume_url && (
                <a
                  href={candidate.resume_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2.5 text-slate-600 hover:text-blue-700 transition-colors"
                >
                  <FileText className="h-4 w-4 shrink-0 text-slate-400" />
                  <span className="flex items-center gap-1">Resume <ExternalLink className="h-3 w-3" /></span>
                </a>
              )}

              {/* ── LinkedIn ── */}
              <div className="flex items-start gap-2.5">
                <Linkedin className="h-4 w-4 shrink-0 text-slate-400 mt-0.5" />
                {editLinkedin ? (
                  <div className="flex items-center gap-1 flex-1 min-w-0">
                    <input
                      autoFocus
                      value={linkedinInput}
                      onChange={e => setLinkedinInput(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') saveLinkedin()
                        if (e.key === 'Escape') setEditLinkedin(false)
                      }}
                      placeholder="linkedin.com/in/…"
                      className="flex-1 min-w-0 rounded-lg border border-blue-300 bg-blue-50 px-2 py-0.5 text-xs focus:outline-none focus:border-blue-400"
                    />
                    <button onClick={saveLinkedin} className="text-blue-600 hover:text-blue-800 shrink-0">
                      <Check className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => setEditLinkedin(false)} className="text-slate-400 hover:text-slate-600 shrink-0">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : candidate.linkedin_url ? (
                  <div className="flex items-center gap-1 flex-1 min-w-0 group">
                    <a
                      href={candidate.linkedin_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-blue-600 hover:text-blue-800 truncate flex-1"
                    >
                      LinkedIn ↗
                    </a>
                    <button
                      onClick={() => { setLinkedinInput(candidate.linkedin_url ?? ''); setEditLinkedin(true) }}
                      className="p-0.5 text-slate-300 hover:text-slate-600 transition-colors shrink-0 opacity-0 group-hover:opacity-100"
                    >
                      <Pencil className="h-3 w-3" />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => { setLinkedinInput(''); setEditLinkedin(true) }}
                    className="text-xs text-slate-400 hover:text-blue-600 transition-colors"
                  >
                    Add LinkedIn…
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Skills */}
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Skills</p>
              <button
                onClick={() => setEditSkills(e => !e)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
              >
                {editSkills ? <Check className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {candidate.skills.map(skill => (
                <span
                  key={skill}
                  className="flex items-center gap-1 rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600"
                >
                  {skill}
                  {editSkills && (
                    <button
                      onClick={async () => {
                        const skills = candidate.skills.filter(s => s !== skill)
                        await fetch(`/api/candidates/${id}`, {
                          method: 'PATCH',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ skills }),
                        })
                        await load()
                      }}
                      className="text-slate-400 hover:text-red-500 transition-colors"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </span>
              ))}
              {editSkills && (
                <input
                  value={skillInput}
                  onChange={e => setSkillInput(e.target.value)}
                  onKeyDown={async e => {
                    if ((e.key === 'Enter' || e.key === ',') && skillInput.trim()) {
                      const skill = skillInput.trim().replace(',', '')
                      const skills = [...candidate.skills, skill]
                      await fetch(`/api/candidates/${id}`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ skills }),
                      })
                      setSkillInput('')
                      await load()
                    }
                  }}
                  placeholder="Add skill…"
                  className="rounded-lg border border-dashed border-slate-300 px-2.5 py-1 text-xs w-24 focus:outline-none focus:border-blue-400"
                />
              )}
              {candidate.skills.length === 0 && !editSkills && (
                <p className="text-xs text-slate-400">No skills listed</p>
              )}
            </div>
          </div>
        </div>

        {/* ── Main content ─────────────────────────────────────────────────── */}
        <div className="flex-1 min-w-0 space-y-6">
          {/* Active applications */}
          {activeApps.length > 0 && (
            <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100">
                <h2 className="text-sm font-bold text-slate-800">Active Applications</h2>
              </div>
              <div className="divide-y divide-slate-100">
                {activeApps.map(app => {
                  const stageStyle = STAGE_COLOR_MAP[app.pipeline_stages?.color ?? 'slate'] ?? STAGE_COLOR_MAP.slate
                  return (
                    <div key={app.id} className="flex items-center gap-4 px-6 py-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <a
                            href={`/jobs/${app.hiring_request_id}`}
                            className="text-sm font-semibold text-slate-900 hover:text-blue-700 transition-colors"
                          >
                            {app.hiring_requests?.position_title ?? 'Unknown Role'}
                          </a>
                          {app.hiring_requests?.ticket_number && (
                            <span className="font-mono text-xs text-slate-400">{app.hiring_requests.ticket_number}</span>
                          )}
                        </div>
                        {app.hiring_requests?.department && (
                          <p className="text-xs text-slate-400 mt-0.5">{app.hiring_requests.department}</p>
                        )}
                      </div>
                      <span className={`rounded-full px-3 py-1 text-xs font-semibold ${stageStyle}`}>
                        {app.pipeline_stages?.name ?? 'Unstaged'}
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => changeStatus(app.id, 'rejected')}
                          className="text-xs text-slate-400 hover:text-red-500 transition-colors"
                        >
                          Reject
                        </button>
                        <a
                          href={`/jobs/${app.hiring_request_id}`}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                          title="Open pipeline"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Notes for first active application */}
          {activeApps.length > 0 && (
            <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100">
                <h2 className="text-sm font-bold text-slate-800">Add Note</h2>
              </div>
              <div className="px-6 py-4">
                <textarea
                  value={note}
                  onChange={e => setNote(e.target.value)}
                  rows={3}
                  placeholder="Leave a note about this candidate…"
                  className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
                <div className="flex justify-end mt-2">
                  <button
                    onClick={() => addNote(activeApps[0].id)}
                    disabled={savingNote || !note.trim()}
                    className="flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 transition-colors disabled:opacity-50"
                  >
                    {savingNote ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    Save Note
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Activity Timeline */}
          {candidate.events.length > 0 && (
            <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100">
                <h2 className="text-sm font-bold text-slate-800">Activity</h2>
              </div>
              <div className="px-6 py-4 space-y-4">
                {candidate.events.map(event => {
                  const cfg = EVENT_CONFIG[event.event_type]
                  return (
                    <div key={event.id} className="flex gap-3">
                      <div className={`h-6 w-6 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${cfg?.color ?? 'bg-slate-100 text-slate-600'}`}>
                        {cfg?.icon ?? <Clock className="h-3.5 w-3.5" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-slate-700">
                          {cfg?.label(event) ?? event.event_type}
                          {event.note && (
                            <span className="block mt-1 text-sm text-slate-500 bg-slate-50 rounded-lg px-3 py-2 border border-slate-100">
                              {event.note}
                            </span>
                          )}
                        </p>
                        <p className="text-xs text-slate-400 mt-0.5">
                          {event.created_by} · {fmtRelative(event.created_at)}
                          <span className="ml-1 text-slate-300">· {fmtDate(event.created_at)}</span>
                        </p>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Closed / historical applications */}
          {closedApps.length > 0 && (
            <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100">
                <h2 className="text-sm font-bold text-slate-800">Previous Applications</h2>
              </div>
              <div className="divide-y divide-slate-100">
                {closedApps.map(app => (
                  <div key={app.id} className="flex items-center gap-4 px-6 py-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-slate-700">{app.hiring_requests?.position_title ?? 'Unknown Role'}</p>
                      <p className="text-xs text-slate-400 mt-0.5">{fmtDate(app.applied_at)}</p>
                    </div>
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      app.status === 'rejected' ? 'bg-red-50 text-red-600' :
                      app.status === 'hired'    ? 'bg-emerald-50 text-emerald-700' :
                                                  'bg-slate-100 text-slate-500'
                    }`}>
                      {app.status.charAt(0).toUpperCase() + app.status.slice(1)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Empty state */}
          {candidate.applications.length === 0 && (
            <div className="rounded-2xl border border-dashed border-slate-200 py-16 flex flex-col items-center text-center">
              <Briefcase className="h-8 w-8 text-slate-300 mb-3" />
              <p className="text-slate-500 font-medium">Not in any pipeline yet</p>
              <p className="text-sm text-slate-400 mt-1 mb-4">Add this candidate to a job to track their progress</p>
              <button
                onClick={openAddToJob}
                className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />
                Add to Job
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Add to Job Modal ──────────────────────────────────────────────── */}
      {showAddToJob && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/30 backdrop-blur-sm"
            onClick={() => setShowAddToJob(false)}
          />
          {/* Modal */}
          <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col max-h-[80vh]">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 shrink-0">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Add to Job</h3>
                <p className="text-xs text-slate-400 mt-0.5">Select a job to add {candidate.name} to</p>
              </div>
              <button
                onClick={() => setShowAddToJob(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto">
              {jobsLoading ? (
                <div className="flex items-center justify-center py-10">
                  <Loader2 className="h-5 w-5 animate-spin text-slate-300" />
                </div>
              ) : availableJobs.length === 0 ? (
                <div className="py-10 text-center px-4">
                  <Briefcase className="h-8 w-8 text-slate-200 mx-auto mb-2" />
                  <p className="text-sm font-medium text-slate-500">No available jobs</p>
                  <p className="text-xs text-slate-400 mt-1">
                    {jobs.length === 0
                      ? 'No jobs exist yet — create one first'
                      : 'Candidate is already in all active jobs'}
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {availableJobs.map(job => (
                    <button
                      key={job.id}
                      onClick={() => addToJob(job.id)}
                      disabled={addingToJob === job.id}
                      className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-slate-50 transition-colors text-left disabled:opacity-50"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-slate-900 truncate">{job.position_title}</p>
                        {job.department && <p className="text-xs text-slate-400 mt-0.5">{job.department}</p>}
                      </div>
                      <div className="flex items-center gap-2 ml-3 shrink-0">
                        {job.ticket_number && (
                          <span className="font-mono text-xs text-slate-400">{job.ticket_number}</span>
                        )}
                        {addingToJob === job.id
                          ? <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
                          : <Plus className="h-4 w-4 text-slate-300" />
                        }
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
