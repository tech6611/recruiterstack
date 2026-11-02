'use client'

/**
 * Chat history for the copilot (ChatGPT-style sidebar). Keeps a list of the
 * user's chats, which one is open, and auto-saves the open chat to the server
 * whenever a reply finishes.
 *
 * If the server says history isn't available yet (migration 157 not applied),
 * `available` is false and the chat window keeps its old single in-browser
 * conversation — nothing breaks.
 *
 * The first time history becomes available, whatever conversation was sitting
 * in the browser is saved as the user's first chat, so nothing is lost.
 */

import { useCallback, useEffect, useRef, useState } from 'react'

export interface ChatSummary {
  id: string
  title: string
  updated_at: string
}

type AnyMessage = { role: string; content: string; display?: string }

const ACTIVE_KEY = 'copilot_active_conversation'

function readActive(): string | null {
  try { return localStorage.getItem(ACTIVE_KEY) } catch { return null }
}
function writeActive(id: string | null) {
  try {
    if (id) localStorage.setItem(ACTIVE_KEY, id)
    else localStorage.removeItem(ACTIVE_KEY)
  } catch { /* ignore */ }
}

function titleFrom(messages: AnyMessage[]): string {
  const first = messages.find(m => m.role === 'user')
  return (first?.display ?? first?.content ?? 'New chat').slice(0, 200)
}

export function useCopilotHistory<M extends AnyMessage>(
  messages: M[],
  setMessages: (m: M[]) => void,
  streaming: boolean,
) {
  const [available, setAvailable] = useState<boolean | null>(null)
  const [chats, setChats]         = useState<ChatSummary[]>([])
  const [activeId, setActiveId]   = useState<string | null>(null)
  const [loadingChat, setLoadingChat] = useState(false)

  // Saves are suppressed until the initial load settles, and skipped when the
  // content hasn't changed since the last save/load.
  const ready      = useRef(false)
  const lastSaved  = useRef<string>('')
  const creating   = useRef<Promise<string | null> | null>(null)
  const activeRef  = useRef<string | null>(null)
  activeRef.current = activeId

  const setActive = (id: string | null) => { setActiveId(id); writeActive(id) }

  const fetchJson = async (url: string, init?: RequestInit) => {
    const r = await fetch(url, init)
    if (r.status === 503) { setAvailable(false); return null }
    if (!r.ok) return null
    return r.json()
  }

  const refresh = useCallback(async () => {
    const j = await fetchJson('/api/copilot/conversations')
    if (j?.data) setChats(j.data as ChatSummary[])
    return j
  }, [])

  // ── Initial load ────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const j = await refresh().catch(() => null)
      if (cancelled) return
      if (!j?.data) { setAvailable(prev => prev ?? false); return }
      setAvailable(true)
      const list = j.data as ChatSummary[]
      const stored = readActive()
      if (stored && list.some(c => c.id === stored)) {
        const one = await fetchJson(`/api/copilot/conversations/${stored}`).catch(() => null)
        if (cancelled) return
        if (one?.data) {
          const msgs = (one.data.messages ?? []) as M[]
          lastSaved.current = JSON.stringify(msgs)
          setActiveId(stored)
          setMessages(msgs)
        }
      } else {
        writeActive(null)
        // Otherwise: any conversation already in the browser gets saved as a new
        // chat by the auto-save below (activeId is null → create).
      }
      ready.current = true
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Auto-save when a reply finishes ─────────────────────────────────────────
  useEffect(() => {
    if (!available || !ready.current || streaming || loadingChat) return
    if (messages.length === 0) return
    const snapshot = JSON.stringify(messages)
    if (snapshot === lastSaved.current) return

    const timer = setTimeout(async () => {
      const id = activeRef.current
      if (!id) {
        if (creating.current) return   // a create is already in flight
        creating.current = (async () => {
          const j = await fetchJson('/api/copilot/conversations', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: titleFrom(messages), messages }),
          }).catch(() => null)
          const created = j?.data as (ChatSummary & { messages: unknown[] }) | undefined
          if (!created) return null
          lastSaved.current = snapshot
          setActive(created.id)
          setChats(prev => [{ id: created.id, title: created.title, updated_at: created.updated_at }, ...prev])
          return created.id
        })()
        await creating.current
        creating.current = null
        return
      }
      const j = await fetchJson(`/api/copilot/conversations/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages }),
      }).catch(() => null)
      if (j?.data) {
        lastSaved.current = snapshot
        const s = j.data as ChatSummary
        setChats(prev => [s, ...prev.filter(c => c.id !== s.id)])
      }
    }, 500)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, streaming, available, loadingChat])

  // ── Actions ─────────────────────────────────────────────────────────────────
  const newChat = useCallback(() => {
    if (streaming) return
    lastSaved.current = ''
    setActive(null)
    setMessages([])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streaming])

  const openChat = useCallback(async (id: string) => {
    if (streaming || id === activeRef.current) return
    setLoadingChat(true)
    try {
      const j = await fetchJson(`/api/copilot/conversations/${id}`).catch(() => null)
      if (j?.data) {
        const msgs = (j.data.messages ?? []) as M[]
        lastSaved.current = JSON.stringify(msgs)
        setActive(id)
        setMessages(msgs)
      }
    } finally {
      setLoadingChat(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streaming])

  const deleteChat = useCallback(async (id: string) => {
    const r = await fetch(`/api/copilot/conversations/${id}`, { method: 'DELETE' }).catch(() => null)
    if (!r?.ok) return
    setChats(prev => prev.filter(c => c.id !== id))
    if (id === activeRef.current) {
      lastSaved.current = ''
      setActive(null)
      setMessages([])
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return { available: available === true, chats, activeId, loadingChat, newChat, openChat, deleteChat }
}
