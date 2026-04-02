'use client'

import React, { useState } from 'react'
import { Calendar, Wand2, Gift, ClipboardList, Briefcase, PhoneCall, Mail } from 'lucide-react'
import type { Candidate, CandidateTask, ApplicationEvent, Application, HiringRequest } from '@/lib/types/database'
import { useCandidateProfile } from './CandidateProfileContext'
import ActivitiesTab from './center/ActivitiesTab'
import SummaryTab from './center/SummaryTab'
import HistoryTab from './center/HistoryTab'

type ApplicationWithAttribution = Application & {
  pipeline_stages: { name: string; color: string } | null
  hiring_requests: Pick<HiringRequest, 'id' | 'position_title' | 'department' | 'ticket_number'> | null
}

const CENTER_TABS = ['Summary', 'Activities', 'History'] as const
type CenterTab = typeof CENTER_TABS[number]

interface CenterPanelProps {
  candidate: Candidate
  tasks: CandidateTask[]
  events: ApplicationEvent[]
  applications: ApplicationWithAttribution[]
  selectedAppId: string | null
}

// ── Status styles for job pills ───────────────────────────────────────────────
function statusDot(status: Application['status'], selected: boolean) {
  if (selected) return 'bg-white/70'
  return status === 'active'  ? 'bg-emerald-400'
       : status === 'hired'   ? 'bg-emerald-600'
       : status === 'rejected'? 'bg-red-400'
       : 'bg-slate-400'
}

function statusLabel(status: Application['status']) {
  return status === 'active'   ? 'Active'
       : status === 'hired'    ? 'Hired'
       : status === 'rejected' ? 'Rejected'
       : status === 'withdrawn'? 'Withdrawn'
       : status
}

export default React.memo(function CenterPanel({
  candidate,
  tasks,
  events,
  applications,
  selectedAppId,
}: CenterPanelProps) {
  const {
    addTask: onTaskAdded,
    updateTask: onTaskUpdated,
    deleteTask: onTaskDeleted,
    openScheduleDrawer: onScheduleInterview,
    openEmailDraft,
    openOfferDrawer,
    openScorecardDrawer,
    openVoiceCallModal: onPhoneScreen,
    openEnrollDrawer: onAddToSequence,
    setSelectedAppId: onAppSelected,
    activeApps,
  } = useCandidateProfile()

  const onDraftEmail = () => openEmailDraft(activeApps[0]?.id ?? null)
  const onCreateOffer = () => openOfferDrawer(activeApps[0]?.id ?? '')
  const onAddScorecard = () => openScorecardDrawer(activeApps[0]?.id ?? '')

  const [activeTab, setActiveTab] = useState<CenterTab>('Summary')

  const handleAppSelect = (id: string) => {
    onAppSelected(id)
  }

  // Derive filtered data for the selected application context
  const selectedApp   = selectedAppId ? applications.find(a => a.id === selectedAppId) ?? null : null
  const filteredApps  = selectedApp ? [selectedApp] : applications
  const filteredEvents = selectedApp ? events.filter(e => e.application_id === selectedApp.id) : events
  const filteredActiveApps = filteredApps.filter(a => a.status === 'active')
  const hasActiveApps = filteredActiveApps.length > 0
  const multiJob      = applications.length > 1

  return (
    <div className="flex-1 min-w-0 flex flex-col overflow-hidden border-r border-slate-200 bg-slate-50">
      {/* Sticky action bar */}
      <div className="shrink-0 border-b border-slate-200 bg-white px-4 py-3 flex items-center gap-2 flex-wrap">
        <button
          onClick={onScheduleInterview}
          disabled={!hasActiveApps}
          className="flex items-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700 hover:bg-amber-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Calendar className="h-3.5 w-3.5" />
          Schedule Interview
        </button>
        <button
          onClick={onPhoneScreen}
          disabled={!hasActiveApps}
          className="flex items-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <PhoneCall className="h-3.5 w-3.5" />
          Phone Screen
        </button>
        <button
          onClick={onAddToSequence}
          className="flex items-center gap-1.5 rounded-xl border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs font-semibold text-violet-700 hover:bg-violet-100 transition-colors"
        >
          <Mail className="h-3.5 w-3.5" />
          Add to Sequence
        </button>
        <button
          onClick={onDraftEmail}
          disabled={!hasActiveApps}
          className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Wand2 className="h-3.5 w-3.5 text-violet-500" />
          Draft Email
        </button>
        <button
          onClick={onCreateOffer}
          disabled={!hasActiveApps}
          className="flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Gift className="h-3.5 w-3.5" />
          Create Offer
        </button>
        <button
          onClick={onAddScorecard}
          disabled={!hasActiveApps}
          className="flex items-center gap-1.5 rounded-xl bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <ClipboardList className="h-3.5 w-3.5" />
          Add Scorecard
        </button>
      </div>

      {/* ── Job / Application picker (only when candidate has multiple apps) ── */}
      {multiJob && (
        <div className="shrink-0 border-b border-slate-200 bg-slate-50 px-4 py-2 flex items-center gap-2 overflow-x-auto">
          <Briefcase className="h-3.5 w-3.5 text-slate-400 shrink-0" />
          {applications.map(app => {
            const isSel     = app.id === selectedAppId
            const jobTitle  = app.hiring_requests?.position_title ?? 'Unknown Role'
            return (
              <button
                key={app.id}
                onClick={() => handleAppSelect(app.id)}
                className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium shrink-0 transition-colors border ${
                  isSel
                    ? 'bg-violet-600 border-violet-600 text-white'
                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${statusDot(app.status, isSel)}`} />
                <span className="max-w-[140px] truncate">{jobTitle}</span>
                {!isSel && (
                  <span className={`text-[9px] font-normal ${
                    app.status === 'active'   ? 'text-emerald-500' :
                    app.status === 'rejected' ? 'text-red-400'     :
                    app.status === 'hired'    ? 'text-emerald-600' :
                    'text-slate-400'
                  }`}>
                    · {statusLabel(app.status)}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      )}

      {/* Tab switcher */}
      <div className="shrink-0 bg-white border-b border-slate-200 px-4">
        <div className="flex gap-0">
          {CENTER_TABS.map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab
                  ? 'border-slate-900 text-slate-900'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === 'Activities' && (
          <ActivitiesTab
            candidateId={candidate.id}
            tasks={tasks}
            events={filteredEvents}
            applications={filteredApps}
            onTaskAdded={onTaskAdded}
            onTaskUpdated={onTaskUpdated}
            onTaskDeleted={onTaskDeleted}
          />
        )}
        {activeTab === 'History' && (
          <HistoryTab
            events={filteredEvents}
            applications={filteredApps}
          />
        )}
        {activeTab === 'Summary' && (
          <SummaryTab
            candidate={candidate}
            applications={filteredApps}
          />
        )}
      </div>
    </div>
  )
})
