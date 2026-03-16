'use client'

import { useState } from 'react'
import type { ApplicationEvent, Scorecard, CandidateReferral, Application, HiringRequest } from '@/lib/types/database'
import FeedTab from './right/FeedTab'
import NotesTab from './right/NotesTab'
import FeedbackTab from './right/FeedbackTab'
import EmailsTab from './right/EmailsTab'
import ReferralsTab from './right/ReferralsTab'
import FormsTab from './right/FormsTab'

type ApplicationWithJobInfo = Application & {
  pipeline_stages: { name: string; color: string } | null
  hiring_requests: Pick<HiringRequest, 'id' | 'position_title' | 'department' | 'ticket_number' | 'key_requirements' | 'nice_to_haves' | 'team_context'> | null
}

const RIGHT_TABS = ['Feed', 'Notes', 'Feedback', 'Emails', 'Referrals', 'Forms'] as const
type RightTab = typeof RIGHT_TABS[number]

interface RightPanelProps {
  candidateId: string
  applications: ApplicationWithJobInfo[]
  events: ApplicationEvent[]
  scorecards: Map<string, Scorecard[]>
  scorecardsLoading: boolean
  referrals: CandidateReferral[]
  onAddScorecard: (appId: string) => void
  onScorecardDeleted: (id: string, appId: string) => void
  onDraftEmail: (appId: string) => void
  onNoteAdded: () => void
  onReferralAdded: (ref: CandidateReferral) => void
}

export default function RightPanel({
  candidateId,
  applications,
  events,
  scorecards,
  scorecardsLoading,
  referrals,
  onAddScorecard,
  onScorecardDeleted,
  onDraftEmail,
  onNoteAdded,
  onReferralAdded,
}: RightPanelProps) {
  const [activeTab, setActiveTab] = useState<RightTab>('Feed')

  const activeApps = applications.filter(a => a.status === 'active')
  const firstActiveAppId = activeApps[0]?.id ?? null

  const noteEvents = events.filter(e => e.event_type === 'note_added')
  const emailEvents = events.filter(e => e.event_type === 'email_sent')

  return (
    <div className="w-80 shrink-0 flex flex-col overflow-hidden bg-white">
      {/* Tab bar */}
      <div className="shrink-0 border-b border-slate-200 bg-white">
        <div className="flex overflow-x-auto scrollbar-hide">
          {RIGHT_TABS.map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-3 py-2.5 text-xs font-medium whitespace-nowrap border-b-2 transition-colors shrink-0 ${
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
      <div className="flex-1 overflow-hidden flex flex-col">
        {activeTab === 'Feed' && <FeedTab events={events} />}
        {activeTab === 'Notes' && (
          <NotesTab
            applicationId={firstActiveAppId}
            notes={noteEvents}
            onNoteAdded={onNoteAdded}
          />
        )}
        {activeTab === 'Feedback' && (
          <FeedbackTab
            applications={activeApps}
            scorecards={scorecards}
            scorecardsLoading={scorecardsLoading}
            onAddScorecard={onAddScorecard}
            onScorecardDeleted={onScorecardDeleted}
          />
        )}
        {activeTab === 'Emails' && (
          <EmailsTab
            applications={activeApps}
            emailEvents={emailEvents}
            onDraftEmail={onDraftEmail}
          />
        )}
        {activeTab === 'Referrals' && (
          <ReferralsTab
            candidateId={candidateId}
            referrals={referrals}
            onReferralAdded={onReferralAdded}
          />
        )}
        {activeTab === 'Forms' && (
          <FormsTab applications={activeApps} />
        )}
      </div>
    </div>
  )
}
