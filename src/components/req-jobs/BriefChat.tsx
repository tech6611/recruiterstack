'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Sparkles, Send, Loader2, RefreshCw, ChevronDown, ChevronRight, X } from 'lucide-react'
import type { BriefChatMessage, BriefChatReply } from '@/lib/ai/brief-chat'

/**
 * Edit the brief by talking to it. Each message gets one small AI reply (what it
 * understood) and the brief's notes rewritten; "Apply & rebuild" saves those notes and
 * regenerates the profile from them. Pure props — the dev preview passes a pretend `ask`.
 */
export function BriefChat({ notes, ask, onApply, applying, onClose }: {
  /** The corrections saved on the brief today. */
  notes: string
  ask: (messages: BriefChatMessage[]) => Promise<BriefChatReply>
  /** Save the notes and rebuild; true when it worked. */
  onApply: (notes: string) => Promise<boolean>
  applying: boolean
  /** Close the editor. Discarding first drops the conversation and any unapplied notes. */
  onClose: () => void
}) {
  const [messages, setMessages] = useState<BriefChatMessage[]>([])
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [pending, setPending] = useState<string | null>(null)
  const [showSaved, setShowSaved] = useState(false)
  const saved = lines(notes)
  const dirty = messages.length > 0 || pending != null || draft.trim() !== ''

  function discard() {
    setMessages([])
    setPending(null)
    setDraft('')
    onClose()
  }

  async function send() {
    const text = draft.trim()
    if (!text || sending) return
    const next = [...messages, { role: 'user' as const, text }]
    setMessages(next)
    setDraft('')
    setSending(true)
    try {
      const r = await ask(next)
      setMessages([...next, { role: 'assistant', text: r.reply || 'Noted.' }])
      if (r.changed) setPending(r.notes)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not reach the AI')
      setMessages(messages)
      setDraft(text)
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="rounded-lg border border-indigo-100 bg-indigo-50/40 p-3">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
        <Sparkles className="h-3.5 w-3.5 text-indigo-500" /> Tell the AI what to change
        <span className="ml-auto flex items-center gap-3">
          {saved.length > 0 && (
            <button type="button" onClick={() => setShowSaved((s) => !s)} className="inline-flex items-center gap-0.5 text-[11px] font-normal text-slate-500 hover:text-slate-800">
              {saved.length} note{saved.length === 1 ? '' : 's'} already given {showSaved ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            </button>
          )}
          <button type="button" onClick={discard} disabled={applying || sending}
            title={dirty ? 'Throw away this conversation and its notes — nothing is saved' : 'Close'}
            className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-normal text-slate-500 ring-1 ring-slate-200 hover:bg-white hover:text-rose-600 disabled:opacity-50">
            <X className="h-3 w-3" /> {dirty ? 'Discard' : 'Close'}
          </button>
        </span>
      </div>
      {showSaved && <NoteList items={saved} className="mt-1.5 text-slate-500" />}

      {messages.length > 0 && (
        <div className="mt-2.5 max-h-72 space-y-1.5 overflow-y-auto">
          {messages.map((m, i) => (
            <div key={i} className={m.role === 'user' ? 'flex justify-end' : 'flex'}>
              <div className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-1.5 text-[12px] leading-snug ${m.role === 'user' ? 'bg-slate-900 text-white' : 'bg-white text-slate-700 ring-1 ring-slate-200'}`}>
                {m.text}
              </div>
            </div>
          ))}
          {sending && <div className="flex items-center gap-1 text-[11px] text-slate-400"><Loader2 className="h-3 w-3 animate-spin" /> Thinking…</div>}
        </div>
      )}

      {pending != null && (
        <div className="mt-2.5 rounded-lg bg-white p-2.5 ring-1 ring-indigo-200">
          <div className="text-[11px] font-semibold text-slate-600">The notes the rebuild will follow</div>
          <NoteList items={lines(pending)} className="mt-1 text-slate-700" />
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button type="button" disabled={applying} onClick={() => onApply(pending).then((ok) => { if (ok) { setPending(null); setMessages([]); onClose() } })}
              className="inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-60">
              {applying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Apply &amp; rebuild profile
            </button>
            <span className="text-[11px] leading-snug text-slate-500">
              Rebuilds the brief, bets and weights as a new draft — edits you haven&apos;t saved are replaced. The approved version stays in use until you approve the new one.
            </span>
          </div>
        </div>
      )}

      <div className="mt-2.5 flex items-end gap-2">
        <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={2} maxLength={2000} disabled={applying}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
          placeholder={messages.length ? 'Anything else?' : 'e.g. Drop the IB/VC bet, add Zepto and Meesho, and pay is at market here.'}
          className="flex-1 resize-none rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-800 placeholder:text-slate-400 focus:border-indigo-300 focus:outline-none" />
        <button type="button" onClick={send} disabled={!draft.trim() || sending || applying} title="Send (Enter)"
          className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-slate-900 text-white hover:bg-slate-700 disabled:opacity-40">
          <Send className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}

const lines = (s: string) => s.split('\n').map((l) => l.replace(/^\s*[-•*]\s*/, '').trim()).filter(Boolean)

function NoteList({ items, className = '' }: { items: string[]; className?: string }) {
  return (
    <ul className={`space-y-0.5 text-[11px] leading-snug ${className}`}>
      {items.map((t, i) => <li key={i} className="flex gap-1.5"><span className="text-slate-300">•</span>{t}</li>)}
    </ul>
  )
}
