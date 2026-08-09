'use client'

import React, { useState, useRef, useEffect } from 'react'
import { Calendar, Wand2, Gift, ClipboardList, Briefcase, PhoneCall, Mail, ChevronDown, Sparkles, FileText, Activity } from 'lucide-react'
import type { Candidate, CandidateTask, ApplicationEvent, Application, HiringRequest } from '@/lib/types/database'
import { useCandidateProfile } from './CandidateProfileContext'
import ActivitiesTab from './center/ActivitiesTab'
import SummaryTab from './center/SummaryTab'
import InterviewsTab from './center/InterviewsTab'

type ApplicationWithAttribution = Application & {
  pipeline_stages: { name: string; color: string } | null
  hiring_requests: Pick<HiringRequest, 'id' | 'position_title' | 'department' | 'ticket_number'> | null
}

const CENTER_TABS = ['Summary', 'Activities & Progress'] as const
type CenterTab = typeof CENTER_TABS[number]

// Small "infographic" icon paired with each tab pill.
const TAB_ICON: Record<CenterTab, typeof FileText> = {
  'Summary': FileText,
  'Activities & Progress': Activity,
}

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

  // ── "Actions" menu (replaces the old row of six buttons) ──
  const [optionsOpen, setOptionsOpen] = useState(false)
  const optionsRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (optionsRef.current && !optionsRef.current.contains(e.target as Node)) setOptionsOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

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

  // Every candidate action now lives in the single "Options" menu below.
  const runOption = (fn: () => void) => { setOptionsOpen(false); fn() }
  const optionItems = [
    { label: 'Schedule Interview', icon: Calendar,      onClick: onScheduleInterview, disabled: !hasActiveApps },
    { label: 'Phone Screen',       icon: PhoneCall,     onClick: onPhoneScreen,       disabled: !hasActiveApps },
    { label: 'Add to Sequence',    icon: Mail,          onClick: onAddToSequence,     disabled: false },
    { label: 'Draft Email',        icon: Wand2,         onClick: onDraftEmail,        disabled: !hasActiveApps },
    { label: 'Create Offer',       icon: Gift,          onClick: onCreateOffer,       disabled: !hasActiveApps },
    { label: 'Add Scorecard',      icon: ClipboardList, onClick: onAddScorecard,      disabled: !hasActiveApps },
  ] as const

  return (
    <div className="flex-1 min-w-0 flex flex-col overflow-hidden border-r border-slate-200 bg-slate-50">
      {/* Single control bar: the two tab pills + the Actions menu, all dark pills */}
      <div className="shrink-0 border-b border-slate-200 bg-white px-4 py-3 flex items-center justify-between gap-2">
        {/* Tab pills */}
        <div className="flex items-center gap-2">
          {CENTER_TABS.map(tab => {
            const Icon = TAB_ICON[tab]
            const active = activeTab === tab
            return (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                aria-current={active ? 'page' : undefined}
                className={`flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-xs font-semibold transition-colors bg-[#221b14] text-[#f6efe3] hover:bg-[#34291e] ${
                  active ? 'shadow-[inset_0_-3px_0_0_#2f9e7b]' : ''
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {tab}
              </button>
            )
          })}
        </div>

        {/* Actions menu */}
        <div ref={optionsRef} className="relative">
          <button
            onClick={() => setOptionsOpen(o => !o)}
            aria-haspopup="true"
            aria-expanded={optionsOpen}
            className="flex items-center gap-1.5 rounded-xl bg-[#221b14] px-3.5 py-1.5 text-xs font-semibold text-[#f6efe3] hover:bg-[#34291e] transition-colors"
          >
            <Sparkles className="h-3.5 w-3.5" />
            Actions
            <ChevronDown className={`h-3.5 w-3.5 text-[#b3a791] transition-transform ${optionsOpen ? 'rotate-180' : ''}`} />
          </button>

          {optionsOpen && (
            <div role="menu" className="absolute top-full right-0 mt-1.5 z-30 w-56 bg-white rounded-xl border border-slate-200 shadow-xl overflow-hidden py-1">
              <p className="px-3.5 pt-1.5 pb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                Actions on this candidate
              </p>
              {optionItems.map(item => {
                const Icon = item.icon
                return (
                  <button
                    key={item.label}
                    role="menuitem"
                    onClick={() => runOption(item.onClick)}
                    disabled={item.disabled}
                    className="w-full flex items-center gap-2.5 px-3.5 py-2 text-left text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                  >
                    <Icon className="h-3.5 w-3.5 text-slate-500 shrink-0" />
                    {item.label}
                  </button>
                )
              })}
            </div>
          )}
        </div>
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
                    ? 'bg-slate-600 border-slate-600 text-white'
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

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === 'Summary' && (
          <SummaryTab
            candidate={candidate}
            applications={filteredApps}
          />
        )}
        {activeTab === 'Activities & Progress' && (
          <div className="divide-y divide-slate-200">
            {/* Activities: tasks, pipeline stats, attribution */}
            <ActivitiesTab
              candidateId={candidate.id}
              tasks={tasks}
              events={filteredEvents}
              applications={filteredApps}
              onTaskAdded={onTaskAdded}
              onTaskUpdated={onTaskUpdated}
              onTaskDeleted={onTaskDeleted}
            />

            {/* Interviews — the whole section disappears when there are none */}
            <InterviewsTab candidateId={candidate.id} heading="Interviews" hideWhenEmpty />

          </div>
        )}
      </div>
    </div>
  )
})
