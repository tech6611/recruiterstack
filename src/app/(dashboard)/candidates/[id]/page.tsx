'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Loader2, AlertCircle, ArrowLeft, Plus, Briefcase, X } from 'lucide-react'
import type {
  Candidate, Application, ApplicationEvent, Scorecard,
  CandidateTag, CandidateTask, CandidateReferral,
  HiringRequest,
} from '@/lib/types/database'

import LeftPanel from '@/components/candidates/LeftPanel'
import CenterPanel from '@/components/candidates/CenterPanel'
import RightPanel from '@/components/candidates/RightPanel'
import EmailDraftDrawer from '@/components/candidates/EmailDraftDrawer'
import ScorecardDrawer from '@/components/candidates/ScorecardDrawer'
import ScheduleInterviewDrawer from '@/components/candidates/ScheduleInterviewDrawer'
import CreateOfferDrawer from '@/components/candidates/CreateOfferDrawer'

// ── Types ─────────────────────────────────────────────────────────────────────

interface CandidateWithPipeline extends Candidate {
  applications: (Application & {
    pipeline_stages: { name: string; color: string } | null
    hiring_requests: Pick<HiringRequest, 'id' | 'position_title' | 'department' | 'ticket_number' | 'key_requirements' | 'nice_to_haves' | 'team_context'> | null
  })[]
  events: (ApplicationEvent & { application_id: string })[]
}

type JobOption = { id: string; position_title: string; department: string | null; ticket_number: string | null }

// ── Page ──────────────────────────────────────────────────────────────────────

export default function CandidateProfilePage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()

  // Core data
  const [candidate, setCandidate] = useState<CandidateWithPipeline | null>(null)
  const [loading, setLoading]     = useState(true)

  // Tags
  const [tags, setTags] = useState<CandidateTag[]>([])

  // Tasks
  const [tasks, setTasks] = useState<CandidateTask[]>([])

  // Referrals
  const [referrals, setReferrals] = useState<CandidateReferral[]>([])

  // Add to Job modal
  const [showAddToJob, setShowAddToJob]     = useState(false)
  const [jobs, setJobs]                     = useState<JobOption[]>([])
  const [addingToJob, setAddingToJob]       = useState<string | null>(null)
  const [jobsLoading, setJobsLoading]       = useState(false)

  // Scorecards
  const [scorecards, setScorecards]           = useState<Map<string, Scorecard[]>>(new Map())
  const [scorecardsLoading, setScorecardsLoading] = useState(false)
  const [showScorecardDrawer, setShowScorecardDrawer] = useState(false)
  const [drawerDefaultAppId, setDrawerDefaultAppId]   = useState('')

  // Email draft drawer
  const [emailDraftAppId, setEmailDraftAppId] = useState<string | null>(null)

  // Interviews
  const [showScheduleDrawer, setShowScheduleDrawer]     = useState(false)
  const [scheduleDefaultAppId, setScheduleDefaultAppId] = useState('')

  // Offers
  const [showOfferDrawer, setShowOfferDrawer]   = useState(false)
  const [offerDefaultAppId, setOfferDefaultAppId] = useState('')

  // ── Loaders ───────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch(`/api/candidates/${id}`)
    const json = await res.json()
    setCandidate(json.data ?? null)
    setLoading(false)
  }, [id])

  const loadScorecards = useCallback(async (activeApps: CandidateWithPipeline['applications']) => {
    if (activeApps.length === 0) return
    setScorecardsLoading(true)
    const results = await Promise.all(
      activeApps.map(app =>
        fetch(`/api/scorecards?application_id=${app.id}`)
          .then(r => r.json())
          .then(j => ({ appId: app.id, data: (j.data ?? []) as Scorecard[] }))
      )
    )
    const map = new Map<string, Scorecard[]>()
    for (const { appId, data } of results) map.set(appId, data)
    setScorecards(map)
    setScorecardsLoading(false)
  }, [])

  const loadTags = useCallback(async () => {
    const res = await fetch(`/api/candidates/${id}/tags`)
    if (res.ok) {
      const json = await res.json()
      setTags(json.data ?? [])
    }
  }, [id])

  const loadTasks = useCallback(async () => {
    const res = await fetch(`/api/candidates/${id}/tasks`)
    if (res.ok) {
      const json = await res.json()
      setTasks(json.data ?? [])
    }
  }, [id])

  const loadReferrals = useCallback(async () => {
    const res = await fetch(`/api/candidates/${id}/referrals`)
    if (res.ok) {
      const json = await res.json()
      setReferrals(json.data ?? [])
    }
  }, [id])

  // ── Effects ───────────────────────────────────────────────────────────────

  useEffect(() => { load() }, [load])
  useEffect(() => { loadTags() }, [loadTags])
  useEffect(() => { loadTasks() }, [loadTasks])
  useEffect(() => { loadReferrals() }, [loadReferrals])

  useEffect(() => {
    if (!candidate) return
    const activeApps = candidate.applications.filter(a => a.status === 'active')
    loadScorecards(activeApps)
  }, [candidate, loadScorecards])

  // ── Action handlers ───────────────────────────────────────────────────────

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

  const openScorecardDrawer = (appId: string) => {
    setDrawerDefaultAppId(appId)
    setShowScorecardDrawer(true)
  }

  const handleScorecardDeleted = (scorecardId: string, appId: string) => {
    setScorecards(prev => {
      const next = new Map(prev)
      const current = next.get(appId) ?? []
      next.set(appId, current.filter(s => s.id !== scorecardId))
      return next
    })
  }

  const handleScorecardSaved = useCallback(async () => {
    if (!candidate) return
    const activeApps = candidate.applications.filter(a => a.status === 'active')
    await loadScorecards(activeApps)
  }, [candidate, loadScorecards])

  // ── Loading / Error states ────────────────────────────────────────────────

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
  const existingJobIds = new Set(candidate.applications.map(a => a.hiring_request_id))
  const availableJobs  = jobs.filter(j => !existingJobIds.has(j.id))

  return (
    <>
      {/* Top nav bar */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-200 bg-white shrink-0">
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

      {/* 3-panel layout */}
      <div className="flex h-[calc(100vh-57px-41px)] overflow-hidden bg-slate-50">
        <LeftPanel
          candidate={candidate}
          tags={tags}
          applications={candidate.applications}
          onTagAdded={tag => setTags(prev => [...prev, tag])}
          onTagRemoved={tagId => setTags(prev => prev.filter(t => t.id !== tagId))}
          onLinkedinSaved={url => setCandidate(prev => prev ? { ...prev, linkedin_url: url } : prev)}
          onSkillsUpdated={skills => setCandidate(prev => prev ? { ...prev, skills } : prev)}
        />

        <CenterPanel
          candidate={candidate}
          tasks={tasks}
          events={candidate.events}
          applications={candidate.applications}
          onTaskAdded={task => setTasks(prev => [...prev, task])}
          onTaskUpdated={task => setTasks(prev => prev.map(t => t.id === task.id ? task : t))}
          onTaskDeleted={taskId => setTasks(prev => prev.filter(t => t.id !== taskId))}
          onScheduleInterview={() => {
            setScheduleDefaultAppId(activeApps[0]?.id ?? '')
            setShowScheduleDrawer(true)
          }}
          onDraftEmail={() => setEmailDraftAppId(activeApps[0]?.id ?? null)}
          onCreateOffer={() => {
            setOfferDefaultAppId(activeApps[0]?.id ?? '')
            setShowOfferDrawer(true)
          }}
          onAddScorecard={() => openScorecardDrawer(activeApps[0]?.id ?? '')}
        />

        <RightPanel
          candidateId={candidate.id}
          applications={candidate.applications}
          events={candidate.events}
          scorecards={scorecards}
          scorecardsLoading={scorecardsLoading}
          referrals={referrals}
          onAddScorecard={openScorecardDrawer}
          onScorecardDeleted={handleScorecardDeleted}
          onDraftEmail={appId => setEmailDraftAppId(appId)}
          onNoteAdded={load}
          onReferralAdded={ref => setReferrals(prev => [...prev, ref])}
        />
      </div>

      {/* ── Email Draft Drawer ──────────────────────────────────────────── */}
      {emailDraftAppId && (
        <EmailDraftDrawer
          appId={emailDraftAppId}
          onClose={() => setEmailDraftAppId(null)}
        />
      )}

      {/* ── Scorecard Drawer ────────────────────────────────────────────── */}
      {showScorecardDrawer && (
        <ScorecardDrawer
          activeApps={activeApps}
          defaultAppId={drawerDefaultAppId}
          onClose={() => setShowScorecardDrawer(false)}
          onSaved={handleScorecardSaved}
        />
      )}

      {/* ── Schedule Interview Drawer ───────────────────────────────────── */}
      {showScheduleDrawer && activeApps.length > 0 && (
        <ScheduleInterviewDrawer
          activeApps={activeApps}
          defaultAppId={scheduleDefaultAppId || activeApps[0].id}
          candidateId={candidate.id}
          onClose={() => setShowScheduleDrawer(false)}
          onSaved={load}
        />
      )}

      {/* ── Create Offer Drawer ─────────────────────────────────────────── */}
      {showOfferDrawer && activeApps.length > 0 && (
        <CreateOfferDrawer
          activeApps={activeApps}
          defaultAppId={offerDefaultAppId || activeApps[0].id}
          candidateId={candidate.id}
          onClose={() => setShowOfferDrawer(false)}
          onSaved={load}
        />
      )}

      {/* ── Add to Job Modal ────────────────────────────────────────────── */}
      {showAddToJob && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setShowAddToJob(false)} />
          <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col max-h-[80vh]">
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
    </>
  )
}
