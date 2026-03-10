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

import { useState, useRef, useEffect } from 'react'
import { Bot, X, Send } from 'lucide-react'

// ── Types ─────────────────────────────────────────────────────────────────────

type ToolEvent = {
  name:     string
  label:    string
  summary?: string
}

type Message = {
  id:          string
  role:        'user' | 'assistant'
  content:     string
  toolEvents?: ToolEvent[]
  checkpoint?: { action_summary: string; details: string; impact: string }
}

type SSEEvent =
  | { type: 'text';       delta: string }
  | { type: 'tool_start'; name: string; label: string }
  | { type: 'tool_done';  name: string; summary: string }
  | { type: 'checkpoint'; action_summary: string; details: string; impact: string }
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

// ── Component ─────────────────────────────────────────────────────────────────

export function Copilot() {
  const [open,      setOpen]      = useState(false)
  const [messages,  setMessages]  = useState<Message[]>([])
  const [input,     setInput]     = useState('')
  const [streaming, setStreaming] = useState(false)

  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef  = useRef<HTMLTextAreaElement>(null)

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
                  ? { ...m, toolEvents: [...(m.toolEvents ?? []), { name: event.name, label: event.label }] }
                  : m
              ))
              break

            case 'tool_done':
              setMessages(prev => prev.map((m, i) =>
                i === prev.length - 1 && m.role === 'assistant'
                  ? {
                      ...m,
                      toolEvents: (m.toolEvents ?? []).map(te =>
                        te.name === event.name && !te.summary
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

      {/* Floating action button */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-violet-600 text-white shadow-lg hover:bg-violet-700 active:scale-95 transition-all flex items-center justify-center"
          title="Open AI Copilot"
        >
          <Bot className="w-6 h-6" />
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
          <button
            onClick={() => setOpen(false)}
            className="text-slate-400 hover:text-slate-600 rounded-lg p-1.5 hover:bg-slate-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
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

                      {/* ── Checkpoint approval card ─────────── */}
                      {msg.checkpoint && (
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
                      {msg.content ? (
                        <div className="bg-slate-50 border border-slate-100 rounded-2xl rounded-tl-sm px-3.5 py-2.5 text-sm text-slate-700 leading-relaxed">
                          <MarkdownText text={msg.content} />
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
