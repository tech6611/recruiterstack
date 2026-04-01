'use client'

import { useState } from 'react'
import { Pencil, Check, X, ArrowRight } from 'lucide-react'
import type { CandidateTask, ApplicationEvent, Application, HiringRequest } from '@/lib/types/database'
import { fmtShort } from '@/lib/ui/date-utils'
import TaskScheduler from '../TaskScheduler'
import InterviewProgressTable from '../InterviewProgressTable'

type ApplicationWithAttribution = Application & {
  hiring_requests: Pick<HiringRequest, 'id' | 'position_title' | 'department' | 'ticket_number'> | null
}

interface ActivitiesTabProps {
  candidateId: string
  tasks: CandidateTask[]
  events: ApplicationEvent[]
  applications: ApplicationWithAttribution[]
  onTaskAdded: (task: CandidateTask) => void
  onTaskUpdated: (task: CandidateTask) => void
  onTaskDeleted: (taskId: string) => void
}

function AttributionCard({ app, onCreditedToChanged }: {
  app: ApplicationWithAttribution
  onCreditedToChanged: (appId: string, value: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [input, setInput] = useState(app.credited_to ?? '')
  const [saving, setSaving] = useState(false)

  const save = async () => {
    setSaving(true)
    const res = await fetch(`/api/applications/${app.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ credited_to: input.trim() || null }),
    })
    if (res.ok) {
      onCreditedToChanged(app.id, input.trim())
      setEditing(false)
    }
    setSaving(false)
  }

  return (
    <div className="rounded-xl border border-slate-100 bg-white px-4 py-3 space-y-2">
      {app.hiring_requests && (
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
          {app.hiring_requests.position_title}
        </p>
      )}
      <div className="flex items-center gap-3 text-xs text-slate-600">
        <span className="text-slate-400">Source:</span>
        <span className="font-medium capitalize">{app.source}</span>
      </div>
      <div className="flex items-center gap-2 text-xs">
        <span className="text-slate-400">Credited to:</span>
        {editing ? (
          <div className="flex items-center gap-1 flex-1 min-w-0">
            <input
              autoFocus
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false) }}
              placeholder="Recruiter name…"
              className="flex-1 min-w-0 rounded border border-blue-300 bg-blue-50 px-2 py-0.5 text-xs focus:outline-none focus:border-blue-400"
            />
            <button onClick={save} disabled={saving} className="text-blue-600 hover:text-blue-800 shrink-0">
              <Check className="h-3 w-3" />
            </button>
            <button onClick={() => { setEditing(false); setInput(app.credited_to ?? '') }} className="text-slate-400 hover:text-slate-600 shrink-0">
              <X className="h-3 w-3" />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-1 group">
            <span className="font-medium text-slate-700">{app.credited_to || <span className="italic text-slate-400">Unassigned</span>}</span>
            <button
              onClick={() => { setInput(app.credited_to ?? ''); setEditing(true) }}
              className="p-0.5 text-slate-300 hover:text-slate-600 opacity-0 group-hover:opacity-100 transition-all"
            >
              <Pencil className="h-2.5 w-2.5" />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Pipeline flow section ─────────────────────────────────────────────────────

interface StageStep {
  stage: string
  date: string
  type: 'applied' | 'stage_moved'
}

function buildPipelineFlow(events: ApplicationEvent[], appId: string): StageStep[] {
  return events
    .filter(e =>
      e.application_id === appId &&
      (e.event_type === 'applied' || e.event_type === 'stage_moved') &&
      !!e.to_stage
    )
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    .map(e => ({ stage: e.to_stage as string, date: e.created_at, type: e.event_type as 'applied' | 'stage_moved' }))
}

function PipelineFlowSection({ events, applications }: {
  events: ApplicationEvent[]
  applications: ApplicationWithAttribution[]
}) {
  const totalDays = (() => {
    const sorted = [...events].sort((a, b) =>
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    )
    if (!sorted[0]) return 0
    return Math.floor((Date.now() - new Date(sorted[0].created_at).getTime()) / 86400000)
  })()

  const stagesMoved    = events.filter(e => (e.event_type as string) === 'stage_moved').length
  const emailsSent     = events.filter(e => (e.event_type as string) === 'email_sent').length
  const interviewsDone = events.filter(e => (e.event_type as string) === 'interview_completed').length

  const flows = applications.map(app => ({
    app,
    steps: buildPipelineFlow(events, app.id),
  })).filter(f => f.steps.length > 0)

  if (events.length === 0) return null

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm space-y-4">
      <h4 className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Pipeline Activity</h4>

      {/* Stats bar */}
      <div className="grid grid-cols-4 gap-2">
        {[
          { label: 'Days in pipeline', value: totalDays },
          { label: 'Stage moves',      value: stagesMoved },
          { label: 'Emails sent',      value: emailsSent },
          { label: 'Interviews done',  value: interviewsDone },
        ].map(stat => (
          <div key={stat.label} className="rounded-xl bg-slate-50 border border-slate-100 px-3 py-2.5 text-center">
            <p className="text-xl font-bold text-slate-900">{stat.value}</p>
            <p className="text-[10px] text-slate-400 leading-tight mt-0.5">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Stage progression blocks */}
      {flows.map(({ app, steps }) => (
        <div key={app.id}>
          {app.hiring_requests && flows.length > 1 && (
            <p className="text-[10px] font-semibold text-violet-500 uppercase tracking-wide mb-2">
              {app.hiring_requests.position_title}
            </p>
          )}
          {/* Adaptive: flex-wrap when ≤ 4 stages, horizontal scroll when more */}
          <div className={`flex items-center gap-1 pb-1 ${steps.length > 4 ? 'overflow-x-auto' : 'flex-wrap'}`}>
            {steps.map((step, idx) => {
              const isLast = idx === steps.length - 1
              // Color scheme: Applied = indigo, current/last stage = violet, past = white/slate
              const blockCls = step.type === 'applied'
                ? isLast
                  ? 'bg-indigo-600 border-indigo-600'
                  : 'bg-indigo-50 border-indigo-200'
                : isLast
                  ? 'bg-violet-600 border-violet-600'
                  : 'bg-white border-slate-200'
              const labelCls = step.type === 'applied'
                ? isLast ? 'text-white' : 'text-indigo-700'
                : isLast ? 'text-white' : 'text-slate-800'
              const dateCls = step.type === 'applied'
                ? isLast ? 'text-indigo-200' : 'text-indigo-400'
                : isLast ? 'text-violet-200' : 'text-slate-400'
              return (
                <div key={`${step.stage}-${idx}`} className="flex items-center gap-1 shrink-0">
                  <div className={`rounded-xl px-3 py-2.5 text-center min-w-[80px] border transition-colors ${blockCls}`}>
                    <p className={`text-[11px] font-semibold leading-tight truncate max-w-[96px] ${labelCls}`}>
                      {step.stage}
                    </p>
                    <p className={`text-[9px] font-medium mt-1 ${dateCls}`}>
                      {fmtShort(step.date)}
                    </p>
                  </div>
                  {!isLast && (
                    <ArrowRight className="h-3 w-3 text-slate-300 shrink-0" />
                  )}
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ActivitiesTab({
  candidateId,
  tasks,
  events,
  applications,
  onTaskAdded,
  onTaskUpdated,
  onTaskDeleted,
}: ActivitiesTabProps) {
  const [creditedToMap, setCreditedToMap] = useState<Record<string, string | null>>(
    Object.fromEntries(applications.map(a => [a.id, a.credited_to]))
  )

  const appsWithLocalCredit = applications.map(a => ({
    ...a,
    credited_to: a.id in creditedToMap ? creditedToMap[a.id] : a.credited_to,
  }))

  const handleCreditedToChanged = (appId: string, value: string) => {
    setCreditedToMap(prev => ({ ...prev, [appId]: value || null }))
  }

  return (
    <div className="p-5 space-y-6">
      {/* Tasks */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <TaskScheduler
          candidateId={candidateId}
          tasks={tasks}
          onTaskAdded={onTaskAdded}
          onTaskUpdated={onTaskUpdated}
          onTaskDeleted={onTaskDeleted}
        />
      </div>

      {/* Pipeline flow + stats */}
      <PipelineFlowSection events={events} applications={appsWithLocalCredit} />

      {/* Interview Progress */}
      {events.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <InterviewProgressTable events={events} />
        </div>
      )}

      {/* Attribution */}
      {applications.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Attribution</h4>
          {appsWithLocalCredit.map(app => (
            <AttributionCard
              key={app.id}
              app={app}
              onCreditedToChanged={handleCreditedToChanged}
            />
          ))}
        </div>
      )}
    </div>
  )
}
