'use client'

/**
 * EmailInboxTab — two-way email conversation between the org and a candidate.
 * Shows the merged thread (automated sequence emails + candidate replies +
 * agent/recruiter answers), a reply composer with an AI "suggest reply" helper,
 * and an AI auto-responder toggle. A thread only exists once a candidate has
 * replied to a sequence email.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { Mail, Send, Bot, Sparkles } from 'lucide-react'
import { fmtRelative } from '@/lib/ui/date-utils'

interface ThreadMessage {
  id: string
  direction: 'inbound' | 'outbound'
  from_email: string | null
  to_email: string | null
  subject: string | null
  body: string | null
  sender: string | null
  status: string | null
  created_at: string
  source: 'sequence' | 'reply'
}

interface Conversation {
  id: string
  status: string
  agent_enabled: boolean
  subject: string | null
}

interface ThreadData {
  conversation: Conversation | null
  messages: ThreadMessage[]
}

export default function EmailInboxTab({ candidateId }: { candidateId: string }) {
  const [data, setData] = useState<ThreadData | null>(null)
  const [loading, setLoading] = useState(true)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [drafting, setDrafting] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  const [togglingAgent, setTogglingAgent] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/candidates/${candidateId}/email`)
      const json = await res.json()
      setData(json.data ?? null)
    } catch {
      // keep whatever we had
    } finally {
      setLoading(false)
    }
  }, [candidateId])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' })
  }, [data?.messages.length])

  const send = async () => {
    const body = draft.trim()
    if (!body || sending) return
    setSending(true)
    setSendError(null)
    try {
      const res = await fetch(`/api/candidates/${candidateId}/email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || json?.data?.ok === false) {
        setSendError(json?.data?.reason ?? json?.error ?? 'Send failed')
      } else {
        setDraft('')
        await load()
      }
    } catch {
      setSendError('Send failed')
    } finally {
      setSending(false)
    }
  }

  const suggestReply = async () => {
    if (!data?.conversation || drafting) return
    setDrafting(true)
    setSendError(null)
    try {
      const res = await fetch(`/api/email-conversations/${data.conversation.id}/draft`, {
        method: 'POST',
      })
      const json = await res.json().catch(() => ({}))
      if (res.ok && json?.data?.draft) {
        setDraft(json.data.draft)
      } else {
        setSendError(json?.error ?? 'Could not draft a reply')
      }
    } catch {
      setSendError('Could not draft a reply')
    } finally {
      setDrafting(false)
    }
  }

  const toggleAgent = async () => {
    if (!data?.conversation || togglingAgent) return
    setTogglingAgent(true)
    try {
      await fetch(`/api/candidates/${candidateId}/email`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agent_enabled: !data.conversation.agent_enabled }),
      })
      await load()
    } catch {
      // ignore
    } finally {
      setTogglingAgent(false)
    }
  }

  if (loading) {
    return <div className="p-4 text-sm text-slate-400">Loading…</div>
  }

  const conversation = data?.conversation
  const messages = data?.messages ?? []

  return (
    <div className="flex flex-col h-full">
      {/* Thread */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center py-12 text-center px-4">
            <Mail className="h-8 w-8 text-slate-200 mb-2" />
            <p className="text-sm text-slate-400">No email conversation yet</p>
            <p className="text-xs text-slate-300 mt-1">
              A thread starts automatically once this candidate replies to a sequence email.
            </p>
          </div>
        ) : (
          messages.map((m) => {
            const outbound = m.direction === 'outbound'
            const isAgent = m.sender === 'agent'
            const isSequence = m.source === 'sequence'
            return (
              <div key={m.id} className={`flex ${outbound ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[88%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap break-words ${
                    outbound
                      ? isSequence
                        ? 'bg-slate-50 text-slate-600 border border-slate-100'
                        : 'bg-indigo-50 text-slate-800 border border-indigo-100'
                      : 'bg-white text-slate-800 border border-slate-200'
                  }`}
                >
                  {m.subject && (
                    <p className="mb-1 text-[11px] font-medium text-slate-500">{m.subject}</p>
                  )}
                  {m.body}
                  <div
                    className={`mt-1 flex items-center gap-1 text-[10px] text-slate-400 ${
                      outbound ? 'justify-end' : ''
                    }`}
                  >
                    {isAgent && <Bot className="h-3 w-3" />}
                    <span>
                      {isSequence ? 'Sequence' : isAgent ? 'AI reply' : outbound ? 'You' : 'Candidate'}
                      {' · '}
                      {fmtRelative(m.created_at)}
                    </span>
                  </div>
                </div>
              </div>
            )
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* Footer: AI toggle + composer */}
      {conversation && (
        <div className="shrink-0 border-t border-slate-200 p-3 space-y-2 bg-white">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={toggleAgent}
              disabled={togglingAgent}
              className="flex items-center gap-2 text-xs text-slate-500 hover:text-slate-700 transition-colors disabled:opacity-50"
            >
              <span
                className={`relative inline-flex h-4 w-7 items-center rounded-full transition-colors ${
                  conversation.agent_enabled ? 'bg-indigo-500' : 'bg-slate-300'
                }`}
              >
                <span
                  className={`inline-block h-3 w-3 rounded-full bg-white transition-transform ${
                    conversation.agent_enabled ? 'translate-x-3.5' : 'translate-x-0.5'
                  }`}
                />
              </span>
              AI auto-reply {conversation.agent_enabled ? 'on' : 'off'}
            </button>
            <button
              type="button"
              onClick={suggestReply}
              disabled={drafting}
              className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 transition-colors disabled:opacity-50"
            >
              <Sparkles className="h-3.5 w-3.5" />
              {drafting ? 'Drafting…' : 'Suggest reply'}
            </button>
          </div>

          <div className="flex items-end gap-2">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  send()
                }
              }}
              rows={3}
              placeholder="Reply to the candidate…"
              className="flex-1 resize-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 placeholder-slate-400 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition"
            />
            <button
              type="button"
              onClick={send}
              disabled={sending || !draft.trim()}
              className="shrink-0 rounded-xl bg-[#221b14] p-2.5 text-white hover:bg-[#33271b] transition-colors disabled:opacity-50"
              aria-label="Send email reply"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
          {sendError && <p className="text-xs text-red-500">{sendError}</p>}
        </div>
      )}
    </div>
  )
}
