'use client'
import { useState } from 'react'
import { Plus, Check, Trash2, ChevronDown, ChevronUp, CalendarDays, Clock } from 'lucide-react'
import type { CandidateTask } from '@/lib/types/database'

interface TaskSchedulerProps {
  candidateId: string
  tasks: CandidateTask[]
  onTaskAdded: (task: CandidateTask) => void
  onTaskUpdated: (task: CandidateTask) => void
  onTaskDeleted: (taskId: string) => void
}

export default function TaskScheduler({ candidateId, tasks, onTaskAdded, onTaskUpdated, onTaskDeleted }: TaskSchedulerProps) {
  const [showForm, setShowForm] = useState(false)
  const [title, setTitle] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [assignee, setAssignee] = useState('')
  const [saving, setSaving] = useState(false)
  const [showCompleted, setShowCompleted] = useState(false)

  const incomplete = tasks.filter(t => !t.completed_at)
  const completed  = tasks.filter(t => !!t.completed_at)

  const today = new Date().toISOString().split('T')[0]
  const isOverdue = (t: CandidateTask) => !t.completed_at && !!t.due_date && t.due_date < today

  const submit = async () => {
    const t = title.trim()
    if (!t) return
    setSaving(true)
    const res = await fetch(`/api/candidates/${candidateId}/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: t, due_date: dueDate || null, assignee_name: assignee.trim() || null }),
    })
    if (res.ok) {
      const json = await res.json()
      onTaskAdded(json.data)
      setTitle(''); setDueDate(''); setAssignee(''); setShowForm(false)
    }
    setSaving(false)
  }

  const toggle = async (task: CandidateTask) => {
    const res = await fetch(`/api/candidates/${candidateId}/tasks/${task.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ completed: !task.completed_at }),
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
          <input
            autoFocus
            value={title}
            onChange={e => setTitle(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && submit()}
            placeholder="Task title…"
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder-slate-400 outline-none focus:border-blue-400"
          />
          <div className="grid grid-cols-2 gap-2">
            <div className="flex items-center gap-1.5">
              <CalendarDays className="h-3.5 w-3.5 text-slate-400 shrink-0" />
              <input
                type="date"
                value={dueDate}
                onChange={e => setDueDate(e.target.value)}
                className="flex-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700 outline-none focus:border-blue-400"
              />
            </div>
            <input
              value={assignee}
              onChange={e => setAssignee(e.target.value)}
              placeholder="Assignee (optional)"
              className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700 placeholder-slate-400 outline-none focus:border-blue-400"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => { setShowForm(false); setTitle(''); setDueDate(''); setAssignee('') }} className="px-3 py-1.5 text-xs text-slate-500 hover:text-slate-700">Cancel</button>
            <button onClick={submit} disabled={saving || !title.trim()} className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition-colors">
              {saving ? 'Adding…' : 'Add Task'}
            </button>
          </div>
        </div>
      )}

      {incomplete.length === 0 && !showForm && (
        <p className="text-xs text-slate-400 italic">No pending tasks</p>
      )}

      <div className="space-y-1.5">
        {incomplete.map(task => (
          <div key={task.id} className="flex items-start gap-2.5 group/task">
            <button
              onClick={() => toggle(task)}
              className="mt-0.5 h-4 w-4 rounded border-2 border-slate-300 hover:border-blue-500 flex items-center justify-center shrink-0 transition-colors"
            />
            <div className="flex-1 min-w-0">
              <p className={`text-sm ${isOverdue(task) ? 'text-red-600 font-medium' : 'text-slate-700'}`}>{task.title}</p>
              <div className="flex items-center gap-2 mt-0.5">
                {task.due_date && (
                  <span className={`flex items-center gap-0.5 text-[10px] ${isOverdue(task) ? 'text-red-500' : 'text-slate-400'}`}>
                    <Clock className="h-2.5 w-2.5" />
                    {new Date(task.due_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </span>
                )}
                {task.assignee_name && <span className="text-[10px] text-slate-400">{task.assignee_name}</span>}
              </div>
            </div>
            <button onClick={() => remove(task.id)} className="opacity-0 group-hover/task:opacity-100 text-slate-300 hover:text-red-400 transition-all mt-0.5">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>

      {completed.length > 0 && (
        <div>
          <button
            onClick={() => setShowCompleted(v => !v)}
            className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-600 transition-colors"
          >
            {showCompleted ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            {completed.length} completed
          </button>
          {showCompleted && (
            <div className="mt-1.5 space-y-1.5">
              {completed.map(task => (
                <div key={task.id} className="flex items-start gap-2.5 opacity-50">
                  <button onClick={() => toggle(task)} className="mt-0.5 h-4 w-4 rounded border-2 border-emerald-400 bg-emerald-400 flex items-center justify-center shrink-0">
                    <Check className="h-2.5 w-2.5 text-white" />
                  </button>
                  <p className="text-sm text-slate-500 line-through">{task.title}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
