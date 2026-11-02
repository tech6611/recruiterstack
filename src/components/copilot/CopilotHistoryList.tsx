'use client'

/** The copilot's list of past chats (ChatGPT-style), grouped by recency. */

import { useState } from 'react'
import { MessageSquare, SquarePen, Trash2 } from 'lucide-react'
import type { ChatSummary } from './useCopilotHistory'

function groupLabel(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const t = d.getTime()
  if (t >= startOfToday) return 'Today'
  if (t >= startOfToday - 86_400_000) return 'Yesterday'
  if (t >= startOfToday - 7 * 86_400_000) return 'Previous 7 days'
  if (t >= startOfToday - 30 * 86_400_000) return 'Previous 30 days'
  return 'Older'
}

export function CopilotHistoryList({
  chats, activeId, disabled, onNew, onOpen, onDelete,
}: {
  chats: ChatSummary[]
  activeId: string | null
  disabled?: boolean
  onNew: () => void
  onOpen: (id: string) => void
  onDelete: (id: string) => void
}) {
  const [confirming, setConfirming] = useState<string | null>(null)

  const groups: { label: string; items: ChatSummary[] }[] = []
  for (const c of chats) {
    const label = groupLabel(c.updated_at)
    const g = groups.find(x => x.label === label)
    if (g) g.items.push(c)
    else groups.push({ label, items: [c] })
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="p-2.5 flex-shrink-0">
        <button type="button" onClick={onNew} disabled={disabled}
          className="w-full inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">
          <SquarePen className="w-4 h-4" /> New chat
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-2 pb-3 space-y-3 min-h-0">
        {chats.length === 0 && (
          <p className="px-2 pt-2 text-xs text-slate-400">Your chats will appear here.</p>
        )}
        {groups.map(g => (
          <div key={g.label}>
            <p className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{g.label}</p>
            <ul className="space-y-0.5">
              {g.items.map(c => {
                const active = c.id === activeId
                return (
                  <li key={c.id}
                    className={`group flex items-center gap-1 rounded-lg pr-1 ${active ? 'bg-slate-200/70' : 'hover:bg-slate-100'}`}>
                    <button type="button" disabled={disabled} onClick={() => onOpen(c.id)} title={c.title}
                      className="flex-1 min-w-0 flex items-center gap-2 px-2 py-1.5 text-left text-sm text-slate-700 disabled:opacity-60">
                      <MessageSquare className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                      <span className="truncate">{c.title}</span>
                    </button>
                    {confirming === c.id ? (
                      <span className="flex items-center gap-1 text-[11px] flex-shrink-0">
                        <button type="button" className="rounded px-1.5 py-0.5 bg-red-600 text-white hover:bg-red-700"
                          onClick={() => { setConfirming(null); onDelete(c.id) }}>Delete</button>
                        <button type="button" className="rounded px-1.5 py-0.5 text-slate-500 hover:bg-slate-200"
                          onClick={() => setConfirming(null)}>Keep</button>
                      </span>
                    ) : (
                      <button type="button" title="Delete chat" disabled={disabled}
                        onClick={() => setConfirming(c.id)}
                        className="p-1 rounded text-slate-400 opacity-0 group-hover:opacity-100 focus:opacity-100 hover:text-red-500 hover:bg-red-50 flex-shrink-0">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </div>
    </div>
  )
}
