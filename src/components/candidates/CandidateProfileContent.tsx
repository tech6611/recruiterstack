'use client'

import { useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, AlertCircle, ArrowLeft, Plus } from 'lucide-react'
import { useCandidateProfile } from './CandidateProfileContext'
import LeftPanel from './LeftPanel'
import CenterPanel from './CenterPanel'
import RightPanel from './RightPanel'
import ChangeStatusDropdown from './ChangeStatusDropdown'
import CandidateModals from './CandidateModals'

export default function CandidateProfileContent() {
  const router = useRouter()
  const ctx = useCandidateProfile()

  // Loading state
  if (ctx.loading) {
    return (
      <div className="flex items-center justify-center py-20 text-slate-400 text-sm gap-2">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading profile…
      </div>
    )
  }

  if (!ctx.candidate) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-slate-400 text-sm gap-2">
        <AlertCircle className="h-6 w-6" />
        Candidate not found.
      </div>
    )
  }

  const { candidate, activeApps, tags, tasks, scorecards, scorecardsLoading, referrals, selectedAppId } = ctx

  // Derive filtered data for RightPanel based on selectedAppId
  const filteredApps = useMemo(() =>
    selectedAppId
      ? candidate.applications.filter(a => a.id === selectedAppId)
      : candidate.applications,
    [selectedAppId, candidate]
  )
  const filteredEvents = useMemo(() =>
    selectedAppId
      ? candidate.events.filter(e => e.application_id === selectedAppId)
      : candidate.events,
    [selectedAppId, candidate]
  )

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

        <div className="flex items-center gap-2">
          <ChangeStatusDropdown />

          {/* Add to Job */}
          <button
            onClick={ctx.openAddToJob}
            className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition-colors shadow-sm"
          >
            <Plus className="h-3.5 w-3.5" />
            Add to Job
          </button>
        </div>
      </div>

      {/* 3-panel layout */}
      <div className="flex h-[calc(100vh-57px-41px)] overflow-hidden bg-slate-50">
        <LeftPanel
          candidate={candidate}
          tags={tags}
          applications={candidate.applications}
        />

        <CenterPanel
          candidate={candidate}
          tasks={tasks}
          events={candidate.events}
          applications={candidate.applications}
          selectedAppId={selectedAppId}
        />

        {/* RightPanel: scoped to the selected application for multi-job candidates */}
        <RightPanel
          candidateId={candidate.id}
          applications={filteredApps}
          events={filteredEvents}
          scorecards={scorecards}
          scorecardsLoading={scorecardsLoading}
          referrals={referrals}
        />
      </div>

      <CandidateModals />
    </>
  )
}
