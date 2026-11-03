'use client'

/**
 * AI Recruiter Copilot — Phase 8.5: Autonomous Workflow Agent
 *
 * Floating chat button (bottom-right) → slide-over panel.
 * Streams responses from POST /api/copilot with SSE.
 *
 * Simple Q&A (< 3 tool calls) → text bubble + small tool pills
 * Workflows (≥ 3 tool calls)  → WorkflowStepList with numbered nodes
 * Checkpoints                  → amber CheckpointCard with Proceed / Cancel
 */

import { useState, useRef, useEffect, useCallback } from 'react'
import { Bot, X, Send, Trash2, Pencil, Plus, ShieldAlert, Play, Maximize2, Minimize2, History, SquarePen, Paperclip, FileText, Loader2 } from 'lucide-react'
import { trackEvent } from '@/lib/analytics'
import { CopilotForm } from '@/components/copilot/CopilotForm'
import type { FormSpec } from '@/components/copilot/form-spec'
import { useCopilotHistory } from '@/components/copilot/useCopilotHistory'
import { CopilotHistoryList } from '@/components/copilot/CopilotHistoryList'

// ── Types ─────────────────────────────────────────────────────────────────────

type ToolEvent = {
  id:       string
  name:     string
  label:    string
  summary?: string
}

type PlanStep = {
  number:         number
  description:    string
  tools:          string[]
  needs_approval: boolean
  status:         'pending' | 'queued'
  depends_on?:    string
}

type PlanData = {
  summary: string
  steps:   PlanStep[]
}

/** An approval card. With approval_id, the server is holding the exact
 *  actions listed and runs them only via POST /api/copilot/approve. */
type Checkpoint = {
  action_summary: string
  details:        string
  impact:         string
  approval_id?:   string
  actions?:       { preview: string }[]
  state?:         'pending' | 'running' | 'done' | 'cancelled'
  results?:       { preview: string; result: string }[]
  error?:         string
}

type Message = {
  id:          string
  role:        'user' | 'assistant'
  content:     string
  toolEvents?: ToolEvent[]
  checkpoint?: Checkpoint
  plan?:       PlanData
  /** Click-through form the copilot asked the recruiter to fill (ask_user_form). */
  form?:       FormSpec
  formDone?:   boolean
  /** What the chat bubble shows when it differs from what the AI receives
   *  (e.g. a short summary of a submitted form). */
  display?:    string
  /** Files the recruiter attached to this message, already read into text. */
  attachments?: Attachment[]
}

type Attachment = { name: string; text: string; truncated?: boolean }

/** A file in the input area: being read, ready to send, or failed. */
type PendingFile = { id: string; name: string; status: 'reading' | 'ready' | 'error'; text?: string; truncated?: boolean; error?: string }

const ACCEPTED_FILES = '.pdf,.docx,.txt,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown'

/** What the AI receives for one message. Attached files go in full only on
 *  recent messages — older ones are summarised, so a big PDF isn't re-sent on
 *  every turn of a long chat (the extracted details already live in the form). */
function checkpointNote(c: Checkpoint): string {
  if (c.approval_id) {
    const list = (c.actions ?? []).map(a => `- ${a.preview.split('\n')[0]}`).join('\n')
    if (c.state === 'done') {
      return `[Approval result] The recruiter approved these held actions. What happened:\n${(c.results ?? []).map(r => `- ${r.preview.split('\n')[0]} → ${r.result}`).join('\n')}`
    }
    if (c.state === 'cancelled') return `[Approval result] The recruiter cancelled these held actions — nothing ran:\n${list}`
    return `(These actions are held, waiting for the recruiter's approval — not done yet:\n${list})`
  }
  const asked = `(I asked the recruiter to approve: ${c.action_summary}${c.details ? ` — ${c.details}` : ''}${c.impact ? ` Impact: ${c.impact}` : ''})`
  return c.state === 'cancelled' ? `${asked}\n[Approval result] The recruiter cancelled this.` : asked
}

function apiContent(m: Message, recent: boolean): string {
  let base = m.content.trim() || (m.form
    ? `(I asked the recruiter to fill a form with these fields: ${m.form.fields.map(f => `${f.label} [${f.key}]`).join(', ')})`
    : m.content)
  // Keep what was asked/approved in the history the AI sees — an approval card
  // often comes with no text, and "Approved, proceed" alone loses the plan.
  if (m.checkpoint) base = base ? `${base}\n\n${checkpointNote(m.checkpoint)}` : checkpointNote(m.checkpoint)
  if (!m.attachments?.length) return base
  const files = m.attachments.map(a => recent
    ? `<attachment name="${a.name.replace(/"/g, "'")}"${a.truncated ? ' truncated="true"' : ''}>\n${a.text}\n</attachment>`
    : `(Earlier I attached "${a.name}" — already read.)`).join('\n\n')
  return `${base}\n\n${files}`
}

type SSEEvent =
  | { type: 'text';       delta: string }
  | { type: 'tool_start'; id: string; name: string; label: string }
  | { type: 'tool_done';  id: string; name: string; summary: string }
  | { type: 'checkpoint'; action_summary: string; details: string; impact: string; approval_id?: string; actions?: { preview: string }[] }
  | { type: 'plan';       summary: string; steps: PlanStep[] }
  | { type: 'form';       intro?: string; subject?: string; steps: string[]; fields: FormSpec['fields'] }
  | { type: 'done' }
  | { type: 'error';      message: string }

// ── Constants ─────────────────────────────────────────────────────────────────

const SUGGESTIONS = [
  "What's stale in my pipeline?",
  'Who are my top candidates right now?',
  'Show me all active jobs',
  'Hire 3 backend engineers in New York',
]

// ── Inline markdown renderer ──────────────────────────────────────────────────
// Supports **bold** and newlines — no extra dependencies needed.

function MarkdownText({ text }: { text: string }) {
  const lines = text.split('\n')
  return (
    <>
      {lines.map((line, i) => (
        <span key={i}>
          {line.split(/(\*\*[^*]+\*\*)/).map((part, j) =>
            part.startsWith('**') && part.endsWith('**') && part.length > 4
              ? <strong key={j}>{part.slice(2, -2)}</strong>
              : part
          )}
          {i < lines.length - 1 && <br />}
        </span>
      ))}
    </>
  )
}

// ── Strip plan markers from displayed text ───────────────────────────────────
function stripPlanMarker(text: string): string {
  return text.replace(/<!-- PLAN: [\s\S]*? -->/g, '').trim()
}

// ── WorkflowStepList ──────────────────────────────────────────────────────────
// Rendered when a message has 3 or more tool events (autonomous workflow mode).

function WorkflowStepList({
  steps,
  isStreaming,
}: {
  steps:      ToolEvent[]
  isStreaming: boolean
}) {
  return (
    <div className="bg-slate-50 border border-slate-200 rounded-2xl overflow-hidden">
      <div className="px-3.5 py-2 border-b border-slate-100 bg-white">
        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
          Workflow
        </span>
      </div>
      <div className="divide-y divide-slate-100">
        {steps.map((step, i) => {
          const isDone    = !!step.summary
          const isRunning = !isDone && i === steps.length - 1 && isStreaming

          return (
            <div key={i} className="flex items-start gap-2.5 px-3.5 py-2.5">
              {/* Step icon */}
              <span
                className={`flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold mt-0.5 ${
                  isDone    ? 'bg-emerald-100 text-emerald-600' :
                  isRunning ? 'bg-slate-100 text-slate-600' :
                              'bg-slate-100 text-slate-400'
                }`}
              >
                {isDone ? '✓' : String(i + 1)}
              </span>

              {/* Step label / summary */}
              <div className="min-w-0 flex-1">
                <p className={`text-xs leading-snug ${isDone || isRunning ? 'text-slate-700' : 'text-slate-400'}`}>
                  {isDone ? step.summary : step.label}
                </p>
                {isRunning && (
                  <span className="flex items-center gap-1 mt-1">
                    <span className="w-1 h-1 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-1 h-1 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-1 h-1 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── CheckpointCard ────────────────────────────────────────────────────────────
// Rendered when request_approval is triggered — pauses the workflow for human sign-off.

function CheckpointCard({
  checkpoint,
  onProceed,
  onCancel,
}: {
  checkpoint: Checkpoint
  onProceed:  () => void
  onCancel:   () => void
}) {
  const state = checkpoint.state ?? 'pending'
  const exact = !!checkpoint.approval_id
  return (
    <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3.5 space-y-2.5">
      {/* Header */}
      <div className="flex items-start gap-2">
        <span className="text-base leading-none flex-shrink-0 mt-0.5">{state === 'done' ? '✅' : state === 'cancelled' ? '✖️' : '⏸️'}</span>
        <div>
          <p className="text-sm font-semibold text-amber-900 leading-snug">
            {state === 'done' ? (exact ? 'Approved — results below' : 'Approved') : state === 'cancelled' ? 'Cancelled' : 'Approval needed'}
          </p>
          <p className="text-xs text-amber-800 mt-0.5 leading-relaxed">
            {state === 'cancelled' && exact ? 'Nothing was sent or changed.' : checkpoint.action_summary}
          </p>
        </div>
      </div>

      {/* Exact actions held by the server */}
      {exact && state !== 'done' && (checkpoint.actions?.length ?? 0) > 0 && (
        <div className="space-y-2 max-h-72 overflow-y-auto">
          {checkpoint.actions!.map((a, i) => (
            <div key={i} className="text-xs text-slate-700 bg-white border border-amber-200 rounded-lg px-2.5 py-2 whitespace-pre-wrap break-words leading-relaxed">
              {a.preview}
            </div>
          ))}
        </div>
      )}

      {/* Results after approval */}
      {exact && state === 'done' && (
        <div className="space-y-1.5">
          {(checkpoint.results ?? []).map((r, i) => (
            <div key={i} className="text-xs text-slate-700 bg-white border border-amber-200 rounded-lg px-2.5 py-1.5 leading-relaxed">
              <span className="font-medium">{r.preview.split('\n')[0]}</span>
              <span className="block text-slate-500 mt-0.5">{r.result}</span>
            </div>
          ))}
        </div>
      )}

      {/* Details (plan-level approvals) */}
      {!exact && checkpoint.details && (
        <p className="text-xs text-amber-700 leading-relaxed">{checkpoint.details}</p>
      )}

      {/* Impact badge */}
      {checkpoint.impact && state === 'pending' && (
        <div className="text-xs text-amber-700 bg-amber-100 border border-amber-200 rounded-lg px-2.5 py-1.5 leading-relaxed">
          <span className="font-semibold">{exact ? 'Note: ' : 'Impact: '}</span>{checkpoint.impact}
        </div>
      )}

      {checkpoint.error && (
        <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-2.5 py-1.5">{checkpoint.error}</p>
      )}

      {/* Actions */}
      {(state === 'pending' || state === 'running') && (
        <div className="flex gap-2 pt-0.5">
          <button
            onClick={onProceed}
            disabled={state === 'running'}
            className="flex-1 text-xs font-semibold bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-white rounded-lg px-3 py-2 transition-colors active:scale-95 inline-flex items-center justify-center gap-1.5"
          >
            {state === 'running' ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Running…</> : exact ? 'Approve & run' : 'Proceed →'}
          </button>
          <button
            onClick={onCancel}
            disabled={state === 'running'}
            className="text-xs font-medium text-amber-700 hover:text-amber-900 bg-amber-100 hover:bg-amber-200 disabled:opacity-60 rounded-lg px-3 py-2 transition-colors"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  )
}

// ── PlanCard ─────────────────────────────────────────────────────────────────
// Rendered when Claude generates a structured plan for a complex goal.

function PlanCard({
  plan,
  onUpdatePlan,
  onExecute,
  onModifyViaChat,
}: {
  plan:            PlanData
  onUpdatePlan:    (plan: PlanData) => void
  onExecute:       (plan: PlanData) => void
  onModifyViaChat: () => void
}) {
  const [editingStep, setEditingStep] = useState<number | null>(null)
  const [editText, setEditText]       = useState('')
  const [addingStep, setAddingStep]   = useState(false)
  const [newStepText, setNewStepText] = useState('')

  const startEdit = (step: PlanStep) => {
    setEditingStep(step.number)
    setEditText(step.description)
  }

  const saveEdit = () => {
    if (editingStep === null || !editText.trim()) return
    onUpdatePlan({
      ...plan,
      steps: plan.steps.map(s =>
        s.number === editingStep ? { ...s, description: editText.trim() } : s
      ),
    })
    setEditingStep(null)
  }

  const deleteStep = (stepNumber: number) => {
    if (!confirm('Remove this step from the plan?')) return
    const updated = plan.steps
      .filter(s => s.number !== stepNumber)
      .map((s, i) => ({ ...s, number: i + 1 }))
    onUpdatePlan({ ...plan, steps: updated })
  }

  const addStep = () => {
    if (!newStepText.trim()) return
    const newStep: PlanStep = {
      number:         plan.steps.length + 1,
      description:    newStepText.trim(),
      tools:          [],
      needs_approval: false,
      status:         'pending',
    }
    onUpdatePlan({ ...plan, steps: [...plan.steps, newStep] })
    setNewStepText('')
    setAddingStep(false)
  }

  return (
    <div className="bg-slate-50 border border-slate-200 rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="px-3.5 py-2.5 border-b border-slate-100 bg-white">
        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Plan</p>
        <p className="text-sm font-semibold text-slate-800 mt-0.5">{plan.summary}</p>
      </div>

      {/* Steps */}
      <div className="divide-y divide-slate-100">
        {plan.steps.map(step => {
          const isQueued  = step.status === 'queued'
          const isEditing = editingStep === step.number

          return (
            <div key={step.number} className={`flex items-start gap-2.5 px-3.5 py-2.5 group ${isQueued ? 'opacity-50' : ''}`}>
              {/* Step number + approval indicator */}
              <div className="flex-shrink-0 flex items-center gap-1 mt-0.5">
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                  step.needs_approval
                    ? 'bg-amber-100 text-amber-600'
                    : 'bg-emerald-100 text-emerald-600'
                }`}>
                  {step.number}
                </span>
                {step.needs_approval && (
                  <ShieldAlert className="w-3 h-3 text-amber-500" />
                )}
              </div>

              {/* Description or edit input */}
              <div className="min-w-0 flex-1">
                {isEditing ? (
                  <div className="flex gap-1.5">
                    <input
                      type="text"
                      value={editText}
                      onChange={e => setEditText(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEditingStep(null) }}
                      autoFocus
                      className="flex-1 text-xs border border-slate-300 rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-slate-400"
                    />
                    <button onClick={saveEdit} className="text-xs text-slate-600 font-medium hover:text-slate-800">Save</button>
                  </div>
                ) : (
                  <p className="text-xs leading-snug text-slate-700">
                    {step.description}
                    {isQueued && step.depends_on && (
                      <span className="text-slate-400 italic ml-1">— waiting on: {step.depends_on}</span>
                    )}
                  </p>
                )}
              </div>

              {/* Edit / Delete actions */}
              {!isEditing && !isQueued && (
                <div className="flex-shrink-0 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => startEdit(step)}
                    className="p-1 text-slate-400 hover:text-slate-600 rounded"
                    title="Edit step"
                  >
                    <Pencil className="w-3 h-3" />
                  </button>
                  <button
                    onClick={() => deleteStep(step.number)}
                    className="p-1 text-slate-400 hover:text-red-500 rounded"
                    title="Remove step"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Add step */}
      <div className="px-3.5 py-2 border-t border-slate-100">
        {addingStep ? (
          <div className="flex gap-1.5">
            <input
              type="text"
              value={newStepText}
              onChange={e => setNewStepText(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') addStep(); if (e.key === 'Escape') { setAddingStep(false); setNewStepText('') } }}
              placeholder="Describe the new step…"
              autoFocus
              className="flex-1 text-xs border border-slate-300 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-slate-400 placeholder:text-slate-400"
            />
            <button onClick={addStep} className="text-xs text-slate-600 font-medium hover:text-slate-800">Add</button>
            <button onClick={() => { setAddingStep(false); setNewStepText('') }} className="text-xs text-slate-400 hover:text-slate-600">Cancel</button>
          </div>
        ) : (
          <button
            onClick={() => setAddingStep(true)}
            className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 font-medium"
          >
            <Plus className="w-3 h-3" /> Add Step
          </button>
        )}
      </div>

      {/* Actions */}
      <div className="px-3.5 py-2.5 border-t border-slate-100 bg-white flex items-center gap-2">
        <button
          onClick={() => onExecute(plan)}
          className="flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold bg-slate-600 hover:bg-slate-700 text-white rounded-lg px-3 py-2 transition-colors active:scale-95"
        >
          <Play className="w-3 h-3" /> Execute Plan
        </button>
        <button
          onClick={onModifyViaChat}
          className="text-xs text-slate-500 hover:text-slate-700 font-medium underline underline-offset-2"
        >
          Modify via Chat
        </button>
      </div>
    </div>
  )
}

// ── Component ─────────────────────────────────────────────────────────────────

export function Copilot() {
  const [open,      setOpen]      = useState(false)

  // ── Draggable FAB state ───────────────────────────────────────────────
  const [fabPos, setFabPos] = useState<{ x: number; y: number }>(() => {
    if (typeof window === 'undefined') return { x: 0, y: 0 }
    return { x: window.innerWidth - 80, y: window.innerHeight - 80 }
  })
  const dragging   = useRef(false)
  const dragOffset = useRef({ x: 0, y: 0 })
  const hasMoved   = useRef(false)

  // Initialise position after hydration
  useEffect(() => {
    setFabPos({ x: window.innerWidth - 80, y: window.innerHeight - 80 })
  }, [])

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    dragging.current = true
    hasMoved.current = false
    dragOffset.current = { x: e.clientX - fabPos.x, y: e.clientY - fabPos.y }
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  }, [fabPos])

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging.current) return
    hasMoved.current = true
    const x = Math.max(0, Math.min(e.clientX - dragOffset.current.x, window.innerWidth - 56))
    const y = Math.max(0, Math.min(e.clientY - dragOffset.current.y, window.innerHeight - 56))
    setFabPos({ x, y })
  }, [])

  const onPointerUp = useCallback(() => {
    dragging.current = false
  }, [])

  const handleFabClick = useCallback(() => {
    // Only open if the user didn't drag
    if (!hasMoved.current) setOpen(true)
  }, [])

  const [messages,  setMessages]  = useState<Message[]>(() => {
    // Lazy init — restore conversation from localStorage (survives page navigations)
    if (typeof window === 'undefined') return []
    try {
      const stored = localStorage.getItem('copilot_messages')
      if (stored) return JSON.parse(stored) as Message[]
    } catch { /* ignore parse errors */ }
    return []
  })
  const [input,     setInput]     = useState('')
  const [streaming, setStreaming] = useState(false)
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([])
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Read each attached file into text right away, so sending is instant.
  const addFiles = (files: FileList | File[]) => {
    for (const file of Array.from(files).slice(0, 3)) {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      setPendingFiles(prev => [...prev, { id, name: file.name, status: 'reading' }])
      const body = new FormData()
      body.append('file', file)
      fetch('/api/copilot/attachments', { method: 'POST', body })
        .then(async r => {
          const j = await r.json().catch(() => ({}))
          setPendingFiles(prev => prev.map(p => p.id !== id ? p : r.ok && typeof j.text === 'string'
            ? { ...p, status: 'ready', text: j.text, truncated: !!j.truncated }
            : { ...p, status: 'error', error: j.error ?? "Couldn't read this file" }))
        })
        .catch(() => setPendingFiles(prev => prev.map(p => p.id === id ? { ...p, status: 'error', error: "Couldn't upload this file" } : p)))
    }
  }
  const filesReading = pendingFiles.some(p => p.status === 'reading')
  const readyFiles   = pendingFiles.filter(p => p.status === 'ready')

  // Large centred pop-up vs. narrow side panel (remembered per browser).
  const [expanded, setExpanded] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    try { return localStorage.getItem('copilot_expanded') === '1' } catch { return false }
  })
  useEffect(() => {
    try { localStorage.setItem('copilot_expanded', expanded ? '1' : '0') } catch { /* ignore */ }
  }, [expanded])
  // In the narrow panel the chat list opens over the messages.
  const [showHistory, setShowHistory] = useState(false)

  // Saved chats (ChatGPT-style). Falls back to the single in-browser chat when
  // the server doesn't have history yet.
  const history = useCopilotHistory(messages, setMessages, streaming)
  const startNewChat = () => { history.newChat(); setShowHistory(false); setTimeout(() => inputRef.current?.focus(), 60) }

  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef  = useRef<HTMLTextAreaElement>(null)

  // Persist messages to localStorage whenever they change (keep last 50)
  useEffect(() => {
    try {
      localStorage.setItem('copilot_messages', JSON.stringify(messages.slice(-50)))
    } catch { /* ignore quota errors */ }
  }, [messages])

  // Auto-scroll to newest content
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Focus input when panel opens
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 60)
    }
  }, [open])

  // Escape key closes panel
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  // ── Approval cards ──────────────────────────────────────────────────────────
  const updateCheckpoint = (msgId: string, patch: Partial<Checkpoint>) => {
    setMessages(prev => prev.map(m =>
      m.id === msgId && m.checkpoint ? { ...m, checkpoint: { ...m.checkpoint, ...patch } } : m
    ))
  }

  /** Approve or cancel server-held actions. Only this click runs them. */
  const decideApproval = async (msgId: string, approvalId: string, decision: 'approve' | 'cancel') => {
    updateCheckpoint(msgId, { state: decision === 'approve' ? 'running' : 'cancelled', error: undefined })
    try {
      const res = await fetch('/api/copilot/approve', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ approval_id: approvalId, decision }),
      })
      const json = await res.json().catch(() => ({}))
      if (decision === 'cancel') return
      if (!res.ok) {
        updateCheckpoint(msgId, { state: res.status === 409 ? 'cancelled' : 'pending', error: json.error ?? `Couldn't run it (HTTP ${res.status}). Nothing new was done.` })
        return
      }
      updateCheckpoint(msgId, { state: 'done', results: json.results ?? [] })
      trackEvent('copilot_approval_run', { count: (json.results ?? []).length })
    } catch {
      if (decision === 'approve') updateCheckpoint(msgId, { state: 'pending', error: 'Network error — please try again.' })
    }
  }

  // ── Submit handler ──────────────────────────────────────────────────────────
  const submit = async (text: string, display?: string, opts: { withFiles?: boolean } = {}) => {
    const attachments: Attachment[] = opts.withFiles
      ? readyFiles.map(f => ({ name: f.name, text: f.text ?? '', truncated: f.truncated }))
      : []
    const trimmed = text.trim() || (attachments.length ? 'Please take a look at the attached file.' : '')
    if (!trimmed || streaming || (opts.withFiles && filesReading)) return

    const ts = Date.now()
    const userMsg:      Message = {
      id: String(ts), role: 'user', content: trimmed,
      ...(display ? { display } : {}),
      ...(attachments.length ? { attachments } : {}),
    }
    if (opts.withFiles) setPendingFiles([])
    const assistantMsg: Message = { id: String(ts + 1), role: 'assistant', content: '', toolEvents: [] }

    // Build API payload from current messages + new user message
    // A form-only assistant turn has no text — describe the form so the AI
    // remembers what it asked.
    const all = [...messages, userMsg]
    const apiMessages = all.map((m, i) => ({
      role: m.role,
      content: apiContent(m, i >= all.length - 4),
    }))

    setMessages(prev => [...prev, userMsg, assistantMsg])
    setInput('')
    setStreaming(true)

    // Reset textarea height
    if (inputRef.current) {
      inputRef.current.style.height = 'auto'
    }

    trackEvent('copilot_message_sent', {})

    try {
      const res = await fetch('/api/copilot', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ messages: apiMessages }),
      })

      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`)

      const reader  = res.body.getReader()
      const decoder = new TextDecoder()
      let   buffer  = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })

        // SSE events are separated by \n\n
        const parts = buffer.split('\n\n')
        buffer = parts.pop() ?? ''

        for (const part of parts) {
          const dataLine = part.split('\n').find(l => l.startsWith('data: '))
          if (!dataLine) continue

          let event: SSEEvent
          try { event = JSON.parse(dataLine.slice(6)) } catch { continue }

          switch (event.type) {
            case 'text':
              setMessages(prev => prev.map((m, i) =>
                i === prev.length - 1 && m.role === 'assistant'
                  ? { ...m, content: m.content + event.delta }
                  : m
              ))
              break

            case 'tool_start':
              setMessages(prev => prev.map((m, i) =>
                i === prev.length - 1 && m.role === 'assistant'
                  ? { ...m, toolEvents: [...(m.toolEvents ?? []), { id: event.id, name: event.name, label: event.label }] }
                  : m
              ))
              break

            case 'tool_done':
              setMessages(prev => prev.map((m, i) =>
                i === prev.length - 1 && m.role === 'assistant'
                  ? {
                      ...m,
                      toolEvents: (m.toolEvents ?? []).map(te =>
                        te.id === event.id
                          ? { ...te, summary: event.summary }
                          : te
                      ),
                    }
                  : m
              ))
              break

            case 'checkpoint':
              setMessages(prev => prev.map((m, i) =>
                i === prev.length - 1 && m.role === 'assistant'
                  ? {
                      ...m,
                      checkpoint: {
                        action_summary: event.action_summary,
                        details:        event.details,
                        impact:         event.impact,
                        approval_id:    event.approval_id,
                        actions:        event.actions,
                        state:          'pending',
                      },
                    }
                  : m
              ))
              setStreaming(false)
              break

            case 'form':
              setMessages(prev => prev.map((m, i) =>
                i === prev.length - 1 && m.role === 'assistant'
                  ? { ...m, form: { intro: event.intro, subject: event.subject, steps: event.steps ?? [], fields: event.fields ?? [] } }
                  : m
              ))
              break

            case 'plan':
              setMessages(prev => prev.map((m, i) =>
                i === prev.length - 1 && m.role === 'assistant'
                  ? { ...m, plan: { summary: event.summary, steps: event.steps } }
                  : m
              ))
              break

            case 'error':
              setMessages(prev => prev.map((m, i) =>
                i === prev.length - 1 && m.role === 'assistant'
                  ? { ...m, content: m.content || `⚠️ ${event.message}` }
                  : m
              ))
              setStreaming(false)
              break

            case 'done':
              setStreaming(false)
              break
          }
        }
      }
    } catch {
      setMessages(prev => prev.map((m, i) =>
        i === prev.length - 1 && m.role === 'assistant'
          ? { ...m, content: '⚠️ Something went wrong. Please try again.' }
          : m
      ))
    } finally {
      setStreaming(false)
      // Re-focus input after response
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <>
      {/* Backdrop — click to close */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/10"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Floating action button — draggable */}
      {!open && (
        <button
          onClick={handleFabClick}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          style={{ left: fabPos.x, top: fabPos.y }}
          className="fixed z-50 w-14 h-14 rounded-full bg-slate-600 text-white shadow-lg hover:bg-slate-700 transition-colors flex items-center justify-center cursor-grab active:cursor-grabbing touch-none select-none"
          title="Open AI Copilot (drag to reposition)"
        >
          <Bot className="w-6 h-6 pointer-events-none" />
          {streaming && (
            <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 bg-emerald-400 rounded-full border-2 border-white animate-ping" />
          )}
        </button>
      )}

      {/* Panel — narrow slide-over, or a large centred pop-up when expanded */}
      <div
        className={expanded
          ? `fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(1180px,94vw)] h-[90vh] rounded-2xl overflow-hidden bg-white z-50 flex shadow-2xl transition-all duration-200 ease-out ${
              open ? 'opacity-100 scale-100' : 'opacity-0 scale-95 pointer-events-none'
            }`
          : `fixed right-0 top-0 h-full w-[440px] bg-white z-50 flex shadow-2xl transition-transform duration-300 ease-in-out ${
              open ? 'translate-x-0' : 'translate-x-full'
            }`}
      >
        {/* ── Chat list sidebar (expanded view) ──────────────────────────── */}
        {expanded && history.available && (
          <div className="w-64 flex-shrink-0 border-r border-slate-100 bg-slate-50/70">
            <CopilotHistoryList
              chats={history.chats}
              activeId={history.activeId}
              disabled={streaming}
              onNew={startNewChat}
              onOpen={id => history.openChat(id)}
              onDelete={id => history.deleteChat(id)}
            />
          </div>
        )}

        <div className="flex-1 min-w-0 flex flex-col">
        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0">
              <Bot className="w-4 h-4 text-slate-600" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-800 leading-none">AI Copilot</p>
              <p className="text-xs text-slate-400 mt-0.5">
                {streaming ? (
                  <span className="text-slate-500">Working…</span>
                ) : (
                  'Your autonomous recruiting agent'
                )}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {history.available ? (
              <>
                {!expanded && (
                  <button
                    onClick={() => setShowHistory(v => !v)}
                    title="Your chats"
                    className={`rounded-lg p-1.5 transition-colors ${showHistory ? 'bg-slate-100 text-slate-700' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'}`}
                  >
                    <History className="w-4 h-4" />
                  </button>
                )}
                <button
                  onClick={startNewChat}
                  disabled={streaming}
                  title="New chat"
                  className="text-slate-400 hover:text-slate-600 rounded-lg p-1.5 hover:bg-slate-100 transition-colors disabled:opacity-40"
                >
                  <SquarePen className="w-4 h-4" />
                </button>
              </>
            ) : messages.length > 0 && (
              <button
                onClick={() => {
                  setMessages([])
                  try { localStorage.removeItem('copilot_messages') } catch { /* ignore */ }
                }}
                title="Clear conversation"
                className="text-slate-400 hover:text-red-500 rounded-lg p-1.5 hover:bg-red-50 transition-colors"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={() => { setExpanded(v => !v); setShowHistory(false) }}
              title={expanded ? 'Shrink to side panel' : 'Expand'}
              className="text-slate-400 hover:text-slate-600 rounded-lg p-1.5 hover:bg-slate-100 transition-colors"
            >
              {expanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
            <button
              onClick={() => setOpen(false)}
              className="text-slate-400 hover:text-slate-600 rounded-lg p-1.5 hover:bg-slate-100 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* ── Chat list over the messages (narrow view) ───────────────────── */}
        {!expanded && showHistory && history.available && (
          <div className="flex-1 min-h-0 bg-slate-50/70">
            <CopilotHistoryList
              chats={history.chats}
              activeId={history.activeId}
              disabled={streaming}
              onNew={startNewChat}
              onOpen={id => { history.openChat(id); setShowHistory(false) }}
              onDelete={id => history.deleteChat(id)}
            />
          </div>
        )}

        {/* ── Messages ───────────────────────────────────────────────────── */}
        <div className={`flex-1 overflow-y-auto py-4 space-y-4 min-h-0 ${
          !expanded && showHistory && history.available ? 'hidden' : ''
        } ${expanded ? 'px-[max(1rem,calc((100%_-_48rem)/2))]' : 'px-4'}`}>
          {messages.length === 0 ? (
            /* Empty state */
            <div className="flex flex-col items-center justify-center h-full text-center pb-8">
              <div className="w-14 h-14 rounded-2xl bg-slate-50 flex items-center justify-center mb-4">
                <Bot className="w-7 h-7 text-slate-400" />
              </div>
              <p className="text-sm font-semibold text-slate-700 mb-1">What should we work on?</p>
              <p className="text-xs text-slate-400 mb-5 max-w-[220px]">
                Give me a goal and I&apos;ll execute the full recruiting workflow autonomously
              </p>
              <div className="flex flex-col gap-2 w-full max-w-[290px]">
                {SUGGESTIONS.map(s => (
                  <button
                    key={s}
                    onClick={() => submit(s)}
                    className="text-xs text-left bg-slate-50 hover:bg-slate-50 hover:text-slate-700 text-slate-600 border border-slate-200 hover:border-slate-200 rounded-xl px-3.5 py-2.5 transition-colors"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((msg, msgIdx) => {
              const isLastAssistant = msgIdx === messages.length - 1 && msg.role === 'assistant'
              // Hide the form's own call (older saved chats still have a stuck
              // "Running ask_user_form…" chip) — the form card stands for it.
              const tools           = (msg.toolEvents ?? []).filter(te => te.name !== 'ask_user_form')
              const isLive          = isLastAssistant && streaming
              const allToolsDone    = !tools.length || tools.every(te => !!te.summary)
              const isWorkflow      = tools.length >= 3

              return (
                <div
                  key={msg.id}
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  {msg.role === 'user' ? (
                    /* User bubble */
                    <div className="max-w-[82%] bg-slate-600 text-white rounded-2xl rounded-tr-sm px-3.5 py-2 text-sm leading-relaxed space-y-1.5">
                      {msg.attachments?.length ? (
                        <div className="flex flex-wrap gap-1">
                          {msg.attachments.map((a, i) => (
                            <span key={i} className="inline-flex items-center gap-1 rounded-md bg-white/15 px-1.5 py-0.5 text-xs">
                              <FileText className="w-3 h-3" /> {a.name}
                            </span>
                          ))}
                        </div>
                      ) : null}
                      <div>{msg.display ?? msg.content}</div>
                    </div>
                  ) : (
                    /* Assistant bubble */
                    <div className="max-w-[96%] w-full space-y-2">

                      {/* ── Workflow step list (≥3 tools) ──── */}
                      {isWorkflow && (
                        <WorkflowStepList
                          steps={tools}
                          isStreaming={isLive}
                        />
                      )}

                      {/* ── Small tool pills (<3 tools) ─────── */}
                      {!isWorkflow && tools.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {tools.map((te, i) => (
                            <span
                              key={i}
                              className={`inline-flex items-center text-xs font-medium rounded-full px-2.5 py-0.5 transition-colors ${
                                te.summary
                                  ? 'bg-emerald-50 text-emerald-700'
                                  : 'bg-slate-50 text-slate-600'
                              }`}
                            >
                              {/* Only animate while this reply is actually running. */}
                              {!te.summary && isLive && (
                                <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-ping mr-1.5 flex-shrink-0" />
                              )}
                              {te.summary ? `✓ ${te.summary}` : te.label}
                            </span>
                          ))}
                        </div>
                      )}

                      {/* ── Plan card ─────────────────────────── */}
                      {msg.plan && (
                        <PlanCard
                          plan={msg.plan}
                          onUpdatePlan={(newPlan) => {
                            setMessages(prev => prev.map(m =>
                              m.id === msg.id ? { ...m, plan: newPlan } : m
                            ))
                          }}
                          onExecute={(executedPlan) => {
                            setMessages(prev => prev.map(m =>
                              m.id === msg.id ? { ...m, plan: undefined, checkpoint: undefined } : m
                            ))
                            submit(`Approved. Execute this plan:\n${JSON.stringify(executedPlan.steps)}`)
                          }}
                          onModifyViaChat={() => {
                            setInput('Modify the plan: ')
                            setTimeout(() => inputRef.current?.focus(), 50)
                          }}
                        />
                      )}

                      {/* ── Checkpoint approval card ─────────── */}
                      {msg.checkpoint && !msg.plan && (
                        <CheckpointCard
                          checkpoint={msg.checkpoint}
                          onProceed={() => {
                            if (msg.checkpoint?.approval_id) { decideApproval(msg.id, msg.checkpoint.approval_id, 'approve'); return }
                            if (streaming) return
                            updateCheckpoint(msg.id, { state: 'done' })
                            submit('Approved, please proceed with the plan.')
                          }}
                          onCancel={() => {
                            if (msg.checkpoint?.approval_id) { decideApproval(msg.id, msg.checkpoint.approval_id, 'cancel'); return }
                            updateCheckpoint(msg.id, { state: 'cancelled' })
                          }}
                        />
                      )}

                      {/* ── Text content ─────────────────────── */}
                      {stripPlanMarker(msg.content) ? (
                        <div className="bg-slate-50 border border-slate-100 rounded-2xl rounded-tl-sm px-3.5 py-2.5 text-sm text-slate-700 leading-relaxed">
                          <MarkdownText text={stripPlanMarker(msg.content)} />
                        </div>
                      ) : (
                        /* Loading dots — while streaming, all tools done, no checkpoint */
                        isLastAssistant && streaming && allToolsDone && !msg.checkpoint && !msg.form && (
                          <div className="bg-slate-50 border border-slate-100 rounded-2xl rounded-tl-sm px-3.5 py-3">
                            <span className="flex items-center gap-1">
                              <span className="w-1.5 h-1.5 bg-slate-300 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                              <span className="w-1.5 h-1.5 bg-slate-300 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                              <span className="w-1.5 h-1.5 bg-slate-300 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                            </span>
                          </div>
                        )
                      )}

                      {/* ── Click-through form (ask_user_form) ── */}
                      {msg.form && !msg.formDone && (
                        <CopilotForm
                          spec={msg.form}
                          disabled={streaming}
                          onSubmit={({ message, display }) => {
                            setMessages(prev => prev.map(m =>
                              m.id === msg.id ? { ...m, formDone: true } : m
                            ))
                            submit(message, display)
                          }}
                        />
                      )}
                    </div>
                  )}
                </div>
              )
            })
          )}
          <div ref={bottomRef} />
        </div>

        {/* ── Input ──────────────────────────────────────────────────────── */}
        <div
          className={`border-t py-3 flex-shrink-0 transition-colors ${dragOver ? 'border-sky-300 bg-sky-50' : 'border-slate-100 bg-white'} ${expanded ? 'px-[max(0.75rem,calc((100%_-_48rem)/2))]' : 'px-3'}`}
          onDragOver={e => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setDragOver(true) } }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files) }}
        >
          {/* Attached files, waiting to be sent */}
          {pendingFiles.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-2">
              {pendingFiles.map(f => (
                <span key={f.id} title={f.error ?? (f.truncated ? 'Long file — only the first part will be read' : f.name)}
                  className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-xs ${
                    f.status === 'error' ? 'border-red-200 bg-red-50 text-red-700' : 'border-slate-200 bg-slate-50 text-slate-700'}`}>
                  {f.status === 'reading' ? <Loader2 className="w-3 h-3 animate-spin" /> : <FileText className="w-3 h-3" />}
                  <span className="max-w-[180px] truncate">{f.name}</span>
                  {f.status === 'reading' && <span className="text-slate-400">reading…</span>}
                  {f.status === 'error' && <span>— {f.error}</span>}
                  <button type="button" title="Remove" className="ml-0.5 text-slate-400 hover:text-slate-700"
                    onClick={() => setPendingFiles(prev => prev.filter(p => p.id !== f.id))}>
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
          <div className="flex gap-2 items-end">
            <input ref={fileInputRef} type="file" accept={ACCEPTED_FILES} multiple className="hidden"
              onChange={e => { if (e.target.files?.length) addFiles(e.target.files); e.target.value = '' }} />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={streaming}
              title="Attach a file (PDF, Word, text) — or drag it here"
              className="flex-shrink-0 w-9 h-9 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 flex items-center justify-center transition-colors disabled:opacity-40"
            >
              <Paperclip className="w-4 h-4" />
            </button>
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => {
                setInput(e.target.value)
                // Auto-grow up to 120px
                e.target.style.height = 'auto'
                e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`
              }}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  submit(input, undefined, { withFiles: true })
                }
              }}
              placeholder="Give me a goal or ask a question…"
              rows={1}
              disabled={streaming}
              className="flex-1 resize-none rounded-xl border border-slate-200 focus:border-slate-300 focus:ring-2 focus:ring-slate-100 outline-none text-sm px-3 py-2 text-slate-700 placeholder:text-slate-400 disabled:bg-slate-50 disabled:cursor-not-allowed transition-colors leading-relaxed"
              style={{ maxHeight: '120px', overflowY: 'auto' }}
            />
            <button
              onClick={() => submit(input, undefined, { withFiles: true })}
              disabled={streaming || filesReading || (!input.trim() && readyFiles.length === 0)}
              className="flex-shrink-0 w-9 h-9 rounded-xl bg-slate-600 text-white flex items-center justify-center hover:bg-slate-700 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
          <p className="text-xs text-slate-400 mt-1.5 px-0.5">
            Attach a PDF/Word file or paste a link · Shift+Enter for new line · Esc to close
          </p>
        </div>
        </div>
      </div>
    </>
  )
}
