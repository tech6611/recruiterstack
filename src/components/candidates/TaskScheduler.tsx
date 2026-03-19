'use client'
import { useState } from 'react'
import { Plus, Trash2, ChevronDown, ChevronUp, CalendarDays, Clock } from 'lucide-react'
import type { CandidateTask, TaskStatus } from '@/lib/types/database'

// ── Predefined task types ─────────────────────────────────────────────────────
const TASK_TYPES = [
  'Phone Screen',
  'Video Interview',
  'Technical Interview',
  'Culture Fit Interview',
  'Panel Interview',
  'Reference Check',
  'Background Check',
  'Portfolio Review',
  'Follow-up Call',
  'Send Offer',
  'Onboarding Call',
  'Other',
] as const

// ── Status config ─────────────────────────────────────────────────────────────
const STATUS_OPTIONS: { value: TaskStatus; label: string; dot: string; badge: string }[] = [
  { value: 'to_do',       label: 'To Do',       dot: 'bg-slate-400',   badge: 'bg-slate-100 text-slate-600' },
  { value: 'in_progress', label: 'In Progress',  dot: 'bg-blue-500',    badge: 'bg-blue-50 text-blue-700' },
  { value: 'done',        label: 'Done',         dot: 'bg-emerald-500', badge: 'bg-emerald-50 text-emerald-700' },
  { value: 'blocked',     label: 'Blocked',      dot: 'bg-red-500',     badge: 'bg-red-50 text-red-700' },
]

function statusConfig(s: TaskStatus) {
  return STATUS_OPTIONS.find(o => o.value === s) ?? STATUS_OPTIONS[0]
}

// ── Inline status selector ─────────────────────────────────────────────────────
function StatusBadge({ status, onChange }: { status: TaskStatus; onChange: (s: TaskStatus) => void }) {
  const [open, setOpen] = useState(false)
  const cfg = statusConfig(status)

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(p => !p)}
        className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${cfg.badge} transition-colors`}
      >
        <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
        {cfg.label}
        <ChevronDown className="h-2.5 w-2.5 opacity-60" />
      </button>

      {open && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full mt-1 z-20 w-36 rounded-xl border border-slate-200 bg-white shadow-lg overflow-hidden">
            {STATUS_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => { onChange(opt.value); setOpen(false) }}
                className={`w-full flex items-center gap-2 px-3 py-2 text-xs font-medium hover:bg-slate-50 transition-colors ${opt.value === status ? 'bg-slate-50' : ''}`}
              >
                <span className={`h-2 w-2 rounded-full ${opt.dot} shrink-0`} />
                {opt.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

interface TaskSchedulerProps {
  candidateId: string
  tasks: CandidateTask[]
  onTaskAdded: (task: CandidateTask) => void
  onTaskUpdated: (task: CandidateTask) => void
  onTaskDeleted: (taskId: string) => void
}

export default function TaskScheduler({ candidateId, tasks, onTaskAdded, onTaskUpdated, onTaskDeleted }: TaskSchedulerProps) {
  const [showForm, setShowForm]         = useState(false)
  const [taskType, setTaskType]         = useState<typeof TASK_TYPES[number]>(TASK_TYPES[0])
  const [customTitle, setCustomTitle]   = useState('')
  const [dueDate, setDueDate]           = useState('')
  const [assignee, setAssignee]         = useState('')
  const [newStatus, setNewStatus]       = useState<TaskStatus>('to_do')
  const [saving, setSaving]             = useState(false)
  const [showCompleted, setShowCompleted] = useState(false)

  const incomplete = tasks.filter(t => t.status !== 'done' && !t.completed_at)
  const done       = tasks.filter(t => t.status === 'done' || !!t.completed_at)

  const today = new Date().toISOString().split('T')[0]
  const isOverdue = (t: CandidateTask) =>
    t.status !== 'done' && !t.completed_at && !!t.due_date && t.due_date < today

  const resetForm = () => {
    setTaskType(TASK_TYPES[0]); setCustomTitle(''); setDueDate('')
    setAssignee(''); setNewStatus('to_do'); setShowForm(false)
  }

  const submit = async () => {
    const title = (taskType === 'Other' ? customTitle : taskType).trim()
    if (!title) return
    setSaving(true)
    const res = await fetch(`/api/candidates/${candidateId}/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title,
        due_date: dueDate || null,
        assignee_name: assignee.trim() || null,
        status: newStatus,
      }),
    })
    if (res.ok) {
      const json = await res.json()
      onTaskAdded(json.data)
      resetForm()
    }
    setSaving(false)
  }

  const changeStatus = async (task: CandidateTask, s: TaskStatus) => {
    const res = await fetch(`/api/candidates/${candidateId}/tasks/${task.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: s }),
    })
    if (res.ok) {
      const json = await res.json()
      onTaskUpdated(json.data)
    }
  }

  const remove = async (taskId: string) => {
    await fetch(`/api/candidates/${candidateId}/tasks/${taskId}`, { method: 'DELETE' })
    onTaskDeleted(taskId)
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Tasks</h4>
        <button
          onClick={() => setShowForm(v => !v)}
          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
        >
          <Plus className="h-3 w-3" /> Add Task
        </button>
      </div>

      {showForm && (
        <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-3 space-y-2">
          {/* Task type dropdown */}
          <select
            autoFocus
            value={taskType}
            onChange={e => { setTaskType(e.target.value as typeof TASK_TYPES[number]); setCustomTitle('') }}
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-blue-400"
          >
            {TASK_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>

          {/* Custom title when "Other" selected */}
          {taskType === 'Other' && (
            <input
              autoFocus
              value={customTitle}
              onChange={e => setCustomTitle(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && submit()}
              placeholder="Describe the task…"
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder-slate-400 outline-none focus:border-blue-400"
            />
          )}

          <div className="grid grid-cols-2 gap-2">
            {/* Due date */}
            <div className="flex items-center gap-1.5">
              <CalendarDays className="h-3.5 w-3.5 text-slate-400 shrink-0" />
              <input
                type="date"
                value={dueDate}
                onChange={e => setDueDate(e.target.value)}
                className="flex-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700 outline-none focus:border-blue-400"
              />
            </div>
            {/* Assignee */}
            <input
              value={assignee}
              onChange={e => setAssignee(e.target.value)}
              placeholder="Assignee (optional)"
              className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700 placeholder-slate-400 outline-none focus:border-blue-400"
            />
          </div>

          {/* Status */}
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-slate-500 shrink-0">Status:</span>
            <select
              value={newStatus}
              onChange={e => setNewStatus(e.target.value as TaskStatus)}
              className="flex-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700 outline-none focus:border-blue-400"
            >
              {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>

          <div className="flex justify-end gap-2">
            <button onClick={resetForm} className="px-3 py-1.5 text-xs text-slate-500 hover:text-slate-700">
              Cancel
            </button>
            <button
              onClick={submit}
              disabled={saving || (taskType === 'Other' && !customTitle.trim())}
              className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {saving ? 'Adding…' : 'Add Task'}
            </button>
          </div>
        </div>
      )}

      {incomplete.length === 0 && !showForm && (
        <p className="text-xs text-slate-400 italic">No pending tasks</p>
      )}

      {/* Incomplete tasks */}
      <div className="space-y-1.5">
        {incomplete.map(task => (
          <div key={task.id} className="flex items-start gap-2.5 group/task">
            <div className="flex-1 min-w-0 rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-2.5">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium ${isOverdue(task) ? 'text-red-600' : 'text-slate-700'}`}>
                    {task.title}
                  </p>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    {task.due_date && (
                      <span className={`flex items-center gap-0.5 text-[10px] ${isOverdue(task) ? 'text-red-500' : 'text-slate-400'}`}>
                        <Clock className="h-2.5 w-2.5" />
                        {new Date(task.due_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </span>
                    )}
                    {task.assignee_name && (
                      <span className="text-[10px] text-slate-400">{task.assignee_name}</span>
                    )}
                    <StatusBadge
                      status={task.status ?? 'to_do'}
                      onChange={s => changeStatus(task, s)}
                    />
                  </div>
                </div>
                <button
                  onClick={() => remove(task.id)}
                  className="opacity-0 group-hover/task:opacity-100 text-slate-300 hover:text-red-400 transition-all shrink-0 mt-0.5"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Done tasks (collapsible) */}
      {done.length > 0 && (
        <div>
          <button
            onClick={() => setShowCompleted(v => !v)}
            className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-600 transition-colors"
          >
            {showCompleted ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            {done.length} completed
          </button>
          {showCompleted && (
            <div className="mt-1.5 space-y-1.5">
              {done.map(task => (
                <div key={task.id} className="flex items-start gap-2.5 group/task opacity-50">
                  <div className="flex-1 min-w-0 rounded-xl border border-slate-100 bg-white px-3 py-2">
                    <p className="text-sm text-slate-500 line-through">{task.title}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <StatusBadge
                        status={task.status ?? 'done'}
                        onChange={s => changeStatus(task, s)}
                      />
                      {task.assignee_name && (
                        <span className="text-[10px] text-slate-400">{task.assignee_name}</span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => remove(task.id)}
                    className="opacity-0 group-hover/task:opacity-100 text-slate-300 hover:text-red-400 transition-all mt-1.5 shrink-0"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
