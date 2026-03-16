'use client'

import { useState } from 'react'
import { Calendar, Wand2, Gift, ClipboardList } from 'lucide-react'
import type { Candidate, CandidateTask, ApplicationEvent, Application, HiringRequest } from '@/lib/types/database'
import ActivitiesTab from './center/ActivitiesTab'
import SummaryTab from './center/SummaryTab'

type ApplicationWithAttribution = Application & {
  pipeline_stages: { name: string; color: string } | null
  hiring_requests: Pick<HiringRequest, 'id' | 'position_title' | 'department' | 'ticket_number'> | null
}

const CENTER_TABS = ['Activities', 'Summary'] as const
type CenterTab = typeof CENTER_TABS[number]

interface CenterPanelProps {
  candidate: Candidate
  tasks: CandidateTask[]
  events: ApplicationEvent[]
  applications: ApplicationWithAttribution[]
  onTaskAdded: (task: CandidateTask) => void
  onTaskUpdated: (task: CandidateTask) => void
  onTaskDeleted: (taskId: string) => void
  onCandidateUpdated: (updated: Partial<Candidate>) => void
  onScheduleInterview: () => void
  onDraftEmail: () => void
  onCreateOffer: () => void
  onAddScorecard: () => void
}

export default function CenterPanel({
  candidate,
  tasks,
  events,
  applications,
  onTaskAdded,
  onTaskUpdated,
  onTaskDeleted,
  onCandidateUpdated,
  onScheduleInterview,
  onDraftEmail,
  onCreateOffer,
  onAddScorecard,
}: CenterPanelProps) {
  const [activeTab, setActiveTab] = useState<CenterTab>('Activities')

  const activeApps = applications.filter(a => a.status === 'active')
  const hasActiveApps = activeApps.length > 0

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
            events={events}
            applications={activeApps}
            onTaskAdded={onTaskAdded}
            onTaskUpdated={onTaskUpdated}
            onTaskDeleted={onTaskDeleted}
          />
        )}
        {activeTab === 'Summary' && (
          <SummaryTab
            candidate={candidate}
            onCandidateUpdated={onCandidateUpdated}
          />
        )}
      </div>
    </div>
  )
}
