'use client'

import { useState } from 'react'
import { Pencil, Check, X } from 'lucide-react'
import type { CandidateTask, ApplicationEvent, Application, HiringRequest } from '@/lib/types/database'
import TaskScheduler from '../TaskScheduler'
import { Card } from '@/components/ui/card'

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
    <Card className="px-4 py-3 space-y-2">
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
              className="flex-1 min-w-0 rounded border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-xs focus:outline-none focus:border-emerald-400"
            />
            <button onClick={save} disabled={saving} aria-label="Save" className="text-emerald-600 hover:text-emerald-800 shrink-0">
              <Check className="h-3 w-3" />
            </button>
            <button onClick={() => { setEditing(false); setInput(app.credited_to ?? '') }} aria-label="Cancel" className="text-slate-400 hover:text-slate-600 shrink-0">
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
    </Card>
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
  const flows = applications.map(app => ({
    app,
    steps: buildPipelineFlow(events, app.id),
  })).filter(f => f.steps.length > 0)

  if (events.length === 0) return null

  return (
    <Card className="p-4 space-y-4">
      <h4 className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Pipeline Activity</h4>

      {/* Stage progression as a table */}
      {flows.map(({ app, steps }) => (
        <div key={app.id} className="space-y-2">
          {app.hiring_requests && flows.length > 1 && (
            <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">
              {app.hiring_requests.position_title}
            </p>
          )}
          <div className="rounded-xl border border-slate-100 overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  <th className="px-3 py-2 text-left font-semibold text-slate-500">Stage</th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-500">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {steps.map((step, idx) => {
                  const isCurrent = idx === steps.length - 1
                  return (
                    <tr key={`${step.stage}-${idx}`} className={isCurrent ? 'bg-emerald-50/40' : ''}>
                      <td className="px-3 py-2 font-medium text-slate-700">
                        {step.stage}
                        {isCurrent && (
                          <span className="ml-2 text-[9px] font-semibold uppercase tracking-wide text-emerald-600">Current</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-slate-500">
                        {new Date(step.date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </Card>
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
      <Card className="p-4">
        <TaskScheduler
          candidateId={candidateId}
          tasks={tasks}
          onTaskAdded={onTaskAdded}
          onTaskUpdated={onTaskUpdated}
          onTaskDeleted={onTaskDeleted}
        />
      </Card>

      {/* Pipeline flow + stats */}
      <PipelineFlowSection events={events} applications={appsWithLocalCredit} />

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
