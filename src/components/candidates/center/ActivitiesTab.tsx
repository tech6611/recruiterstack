'use client'

import { useState } from 'react'
import { Pencil, Check, X } from 'lucide-react'
import type { CandidateTask, ApplicationEvent, Application, HiringRequest } from '@/lib/types/database'
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
