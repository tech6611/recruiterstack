'use client'

/**
 * WhatsAppTab — conversation thread between the org and a candidate.
 * Bubbles by direction with delivery ticks, a send box (template notice when
 * the candidate is outside Meta's 24h window), and an AI-responder toggle.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { MessageCircle, Send, Check, CheckCheck, AlertCircle, Bot } from 'lucide-react'
import type { WhatsAppConversation, WhatsAppMessage } from '@/lib/types/database'
import { fmtRelative } from '@/lib/ui/date-utils'

interface ThreadData {
  conversation: WhatsAppConversation | null
  messages: WhatsAppMessage[]
  within_window: boolean
}

function StatusTicks({ status }: { status: WhatsAppMessage['status'] }) {
  if (status === 'failed') return <AlertCircle className="h-3 w-3 text-red-500" />
  if (status === 'read') return <CheckCheck className="h-3 w-3 text-slate-500" />
  if (status === 'delivered') return <CheckCheck className="h-3 w-3 text-slate-400" />
  if (status === 'sent') return <Check className="h-3 w-3 text-slate-400" />
  return null
}

export default function WhatsAppTab({ candidateId }: { candidateId: string }) {
  const [data, setData] = useState<ThreadData | null>(null)
  const [loading, setLoading] = useState(true)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  const [togglingAgent, setTogglingAgent] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/candidates/${candidateId}/whatsapp`)
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
      const res = await fetch(`/api/candidates/${candidateId}/whatsapp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setSendError(json?.data?.message ?? 'Send failed')
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

  const toggleAgent = async () => {
    if (!data?.conversation || togglingAgent) return
    setTogglingAgent(true)
    try {
      await fetch(`/api/candidates/${candidateId}/whatsapp`, {
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
  const optedOut = conversation?.status === 'opted_out'

  return (
    <div className="flex flex-col h-full">
      {/* Thread */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center py-12 text-center px-4">
            <MessageCircle className="h-8 w-8 text-slate-200 mb-2" />
            <p className="text-sm text-slate-400">No WhatsApp messages yet</p>
            <p className="text-xs text-slate-300 mt-1">Send the first message below, or ask the copilot to reach out.</p>
          </div>
        ) : (
          messages.map(m => {
            const outbound = m.direction === 'outbound'
            return (
              <div key={m.id} className={`flex ${outbound ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap break-words ${
                    outbound
                      ? 'bg-emerald-50 text-slate-800 border border-emerald-100'
                      : 'bg-slate-50 text-slate-800 border border-slate-100'
                  }`}
                >
                  {m.body}
                  {m.template_name && (
                    <p className="mt-1 text-[10px] uppercase tracking-wide text-slate-400">
                      sent as template “{m.template_name}”
                    </p>
                  )}
                  <div className={`mt-1 flex items-center gap-1 text-[10px] text-slate-400 ${outbound ? 'justify-end' : ''}`}>
                    {m.sender?.startsWith('agent:') && <Bot className="h-3 w-3" />}
                    <span>{fmtRelative(m.created_at)}</span>
                    {outbound && <StatusTicks status={m.status} />}
                  </div>
                  {m.status === 'failed' && m.error && (
                    <p className="mt-1 text-[10px] text-red-500">{m.error}</p>
                  )}
                </div>
              </div>
            )
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* Footer: AI toggle + composer */}
      <div className="shrink-0 border-t border-slate-200 p-3 space-y-2 bg-white">
        {conversation && (
          <button
            type="button"
            onClick={toggleAgent}
            disabled={togglingAgent || optedOut}
            className="flex items-center gap-2 text-xs text-slate-500 hover:text-slate-700 transition-colors disabled:opacity-50"
          >
            <span
              className={`relative inline-flex h-4 w-7 items-center rounded-full transition-colors ${
                conversation.agent_enabled ? 'bg-emerald-500' : 'bg-slate-300'
              }`}
            >
              <span
                className={`inline-block h-3 w-3 rounded-full bg-white transition-transform ${
                  conversation.agent_enabled ? 'translate-x-3.5' : 'translate-x-0.5'
                }`}
              />
            </span>
            AI responder {conversation.agent_enabled ? 'on' : 'off'}
            {conversation.status === 'escalated' && (
              <span className="text-amber-600 font-medium">· escalated</span>
            )}
          </button>
        )}

        {optedOut ? (
          <p className="text-xs text-red-500">This candidate opted out of WhatsApp messages.</p>
        ) : (
          <>
            {data && !data.within_window && (
              <p className="text-xs text-amber-600">
                Outside the 24-hour window — your text will be delivered as the org&apos;s approved template.
              </p>
            )}
            <div className="flex items-end gap-2">
              <textarea
                value={draft}
                onChange={e => setDraft(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    send()
                  }
                }}
                rows={2}
                placeholder="Message on WhatsApp…"
                className="flex-1 resize-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 placeholder-slate-400 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 transition"
              />
              <button
                type="button"
                onClick={send}
                disabled={sending || !draft.trim()}
                className="shrink-0 rounded-xl bg-[#221b14] p-2.5 text-white hover:bg-[#33271b] transition-colors disabled:opacity-50"
                aria-label="Send WhatsApp message"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
            {sendError && <p className="text-xs text-red-500">{sendError}</p>}
          </>
        )}
      </div>
    </div>
  )
}
