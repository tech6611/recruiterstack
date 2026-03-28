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
import { Bot, X, Send, Trash2, Pencil, Plus, ShieldAlert, Play } from 'lucide-react'

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

type Message = {
  id:          string
  role:        'user' | 'assistant'
  content:     string
  toolEvents?: ToolEvent[]
  checkpoint?: { action_summary: string; details: string; impact: string }
  plan?:       PlanData
}

type SSEEvent =
  | { type: 'text';       delta: string }
  | { type: 'tool_start'; id: string; name: string; label: string }
  | { type: 'tool_done';  id: string; name: string; summary: string }
  | { type: 'checkpoint'; action_summary: string; details: string; impact: string }
  | { type: 'plan';       summary: string; steps: PlanStep[] }
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
                  isRunning ? 'bg-violet-100 text-violet-600' :
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
                    <span className="w-1 h-1 bg-violet-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-1 h-1 bg-violet-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-1 h-1 bg-violet-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
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
  checkpoint: { action_summary: string; details: string; impact: string }
  onProceed:  () => void
  onCancel:   () => void
}) {
  return (
    <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3.5 space-y-2.5">
      {/* Header */}
      <div className="flex items-start gap-2">
        <span className="text-base leading-none flex-shrink-0 mt-0.5">⏸️</span>
        <div>
          <p className="text-sm font-semibold text-amber-900 leading-snug">
            Approval needed
          </p>
          <p className="text-xs text-amber-800 mt-0.5 leading-relaxed">
            {checkpoint.action_summary}
          </p>
        </div>
      </div>

      {/* Details */}
      {checkpoint.details && (
        <p className="text-xs text-amber-700 leading-relaxed">{checkpoint.details}</p>
      )}

      {/* Impact badge */}
      {checkpoint.impact && (
        <div className="text-xs text-amber-700 bg-amber-100 border border-amber-200 rounded-lg px-2.5 py-1.5 leading-relaxed">
          <span className="font-semibold">Impact: </span>{checkpoint.impact}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2 pt-0.5">
        <button
          onClick={onProceed}
          className="flex-1 text-xs font-semibold bg-amber-500 hover:bg-amber-600 text-white rounded-lg px-3 py-2 transition-colors active:scale-95"
        >
          Proceed →
        </button>
        <button
          onClick={onCancel}
          className="text-xs font-medium text-amber-700 hover:text-amber-900 bg-amber-100 hover:bg-amber-200 rounded-lg px-3 py-2 transition-colors"
        >
          Cancel
        </button>
      </div>
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
    <div className="bg-violet-50 border border-violet-200 rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="px-3.5 py-2.5 border-b border-violet-100 bg-white">
        <p className="text-[10px] font-bold text-violet-500 uppercase tracking-widest">Plan</p>
        <p className="text-sm font-semibold text-slate-800 mt-0.5">{plan.summary}</p>
      </div>

      {/* Steps */}
      <div className="divide-y divide-violet-100">
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
                      className="flex-1 text-xs border border-violet-300 rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-violet-400"
                    />
                    <button onClick={saveEdit} className="text-xs text-violet-600 font-medium hover:text-violet-800">Save</button>
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
                    className="p-1 text-slate-400 hover:text-violet-600 rounded"
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
      <div className="px-3.5 py-2 border-t border-violet-100">
        {addingStep ? (
          <div className="flex gap-1.5">
            <input
              type="text"
              value={newStepText}
              onChange={e => setNewStepText(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') addStep(); if (e.key === 'Escape') { setAddingStep(false); setNewStepText('') } }}
              placeholder="Describe the new step…"
              autoFocus
              className="flex-1 text-xs border border-violet-300 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-violet-400 placeholder:text-slate-400"
            />
            <button onClick={addStep} className="text-xs text-violet-600 font-medium hover:text-violet-800">Add</button>
            <button onClick={() => { setAddingStep(false); setNewStepText('') }} className="text-xs text-slate-400 hover:text-slate-600">Cancel</button>
          </div>
        ) : (
          <button
            onClick={() => setAddingStep(true)}
            className="flex items-center gap-1 text-xs text-violet-500 hover:text-violet-700 font-medium"
          >
            <Plus className="w-3 h-3" /> Add Step
          </button>
        )}
      </div>

      {/* Actions */}
      <div className="px-3.5 py-2.5 border-t border-violet-100 bg-white flex items-center gap-2">
        <button
          onClick={() => onExecute(plan)}
          className="flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold bg-violet-600 hover:bg-violet-700 text-white rounded-lg px-3 py-2 transition-colors active:scale-95"
        >
          <Play className="w-3 h-3" /> Execute Plan
        </button>
        <button
          onClick={onModifyViaChat}
          className="text-xs text-violet-500 hover:text-violet-700 font-medium underline underline-offset-2"
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

  // ── Submit handler ──────────────────────────────────────────────────────────
  const submit = async (text: string) => {
    const trimmed = text.trim()
    if (!trimmed || streaming) return

    const ts = Date.now()
    const userMsg:      Message = { id: String(ts),     role: 'user',      content: trimmed }
    const assistantMsg: Message = { id: String(ts + 1), role: 'assistant', content: '', toolEvents: [] }

    // Build API payload from current messages + new user message
    const apiMessages = [...messages, userMsg].map(m => ({ role: m.role, content: m.content }))

    setMessages(prev => [...prev, userMsg, assistantMsg])
    setInput('')
    setStreaming(true)

    // Reset textarea height
    if (inputRef.current) {
      inputRef.current.style.height = 'auto'
    }

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
                      },
                    }
                  : m
              ))
              setStreaming(false)
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
          className="fixed z-50 w-14 h-14 rounded-full bg-violet-600 text-white shadow-lg hover:bg-violet-700 transition-colors flex items-center justify-center cursor-grab active:cursor-grabbing touch-none select-none"
          title="Open AI Copilot (drag to reposition)"
        >
          <Bot className="w-6 h-6 pointer-events-none" />
          {streaming && (
            <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 bg-emerald-400 rounded-full border-2 border-white animate-ping" />
          )}
        </button>
      )}

      {/* Slide-over panel */}
      <div
        className={`fixed right-0 top-0 h-full w-[440px] bg-white z-50 flex flex-col shadow-2xl transition-transform duration-300 ease-in-out ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-violet-100 flex items-center justify-center flex-shrink-0">
              <Bot className="w-4 h-4 text-violet-600" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-800 leading-none">AI Copilot</p>
              <p className="text-xs text-slate-400 mt-0.5">
                {streaming ? (
                  <span className="text-violet-500">Working…</span>
                ) : (
                  'Your autonomous recruiting agent'
                )}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {messages.length > 0 && (
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
              onClick={() => setOpen(false)}
              className="text-slate-400 hover:text-slate-600 rounded-lg p-1.5 hover:bg-slate-100 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* ── Messages ───────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 min-h-0">
          {messages.length === 0 ? (
            /* Empty state */
            <div className="flex flex-col items-center justify-center h-full text-center pb-8">
              <div className="w-14 h-14 rounded-2xl bg-violet-50 flex items-center justify-center mb-4">
                <Bot className="w-7 h-7 text-violet-400" />
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
                    className="text-xs text-left bg-slate-50 hover:bg-violet-50 hover:text-violet-700 text-slate-600 border border-slate-200 hover:border-violet-200 rounded-xl px-3.5 py-2.5 transition-colors"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((msg, msgIdx) => {
              const isLastAssistant = msgIdx === messages.length - 1 && msg.role === 'assistant'
              const allToolsDone    = !msg.toolEvents?.length || msg.toolEvents.every(te => !!te.summary)
              const isWorkflow      = (msg.toolEvents?.length ?? 0) >= 3

              return (
                <div
                  key={msg.id}
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  {msg.role === 'user' ? (
                    /* User bubble */
                    <div className="max-w-[82%] bg-violet-600 text-white rounded-2xl rounded-tr-sm px-3.5 py-2 text-sm leading-relaxed">
                      {msg.content}
                    </div>
                  ) : (
                    /* Assistant bubble */
                    <div className="max-w-[96%] w-full space-y-2">

                      {/* ── Workflow step list (≥3 tools) ──── */}
                      {isWorkflow && msg.toolEvents && (
                        <WorkflowStepList
                          steps={msg.toolEvents}
                          isStreaming={isLastAssistant && streaming}
                        />
                      )}

                      {/* ── Small tool pills (<3 tools) ─────── */}
                      {!isWorkflow && msg.toolEvents && msg.toolEvents.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {msg.toolEvents.map((te, i) => (
                            <span
                              key={i}
                              className={`inline-flex items-center text-xs font-medium rounded-full px-2.5 py-0.5 transition-colors ${
                                te.summary
                                  ? 'bg-emerald-50 text-emerald-700'
                                  : 'bg-violet-50 text-violet-600'
                              }`}
                            >
                              {!te.summary && (
                                <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-ping mr-1.5 flex-shrink-0" />
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
                          onProceed={() => submit('Approved, please proceed with the plan.')}
                          onCancel={() => {
                            setMessages(prev => prev.map((m, i) =>
                              i === prev.length - 1 && m.role === 'assistant'
                                ? { ...m, checkpoint: undefined }
                                : m
                            ))
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
                        isLastAssistant && streaming && allToolsDone && !msg.checkpoint && (
                          <div className="bg-slate-50 border border-slate-100 rounded-2xl rounded-tl-sm px-3.5 py-3">
                            <span className="flex items-center gap-1">
                              <span className="w-1.5 h-1.5 bg-slate-300 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                              <span className="w-1.5 h-1.5 bg-slate-300 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                              <span className="w-1.5 h-1.5 bg-slate-300 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                            </span>
                          </div>
                        )
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
        <div className="border-t border-slate-100 p-3 flex-shrink-0 bg-white">
          <div className="flex gap-2 items-end">
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
                  submit(input)
                }
              }}
              placeholder="Give me a goal or ask a question…"
              rows={1}
              disabled={streaming}
              className="flex-1 resize-none rounded-xl border border-slate-200 focus:border-violet-300 focus:ring-2 focus:ring-violet-100 outline-none text-sm px-3 py-2 text-slate-700 placeholder:text-slate-400 disabled:bg-slate-50 disabled:cursor-not-allowed transition-colors leading-relaxed"
              style={{ maxHeight: '120px', overflowY: 'auto' }}
            />
            <button
              onClick={() => submit(input)}
              disabled={streaming || !input.trim()}
              className="flex-shrink-0 w-9 h-9 rounded-xl bg-violet-600 text-white flex items-center justify-center hover:bg-violet-700 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
          <p className="text-xs text-slate-400 mt-1.5 px-0.5">
            Shift+Enter for new line · Esc to close
          </p>
        </div>
      </div>
    </>
  )
}
