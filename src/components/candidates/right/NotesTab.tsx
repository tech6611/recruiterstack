'use client'
import { useState } from 'react'
import { Send, Loader2, FileText } from 'lucide-react'
import type { ApplicationEvent } from '@/lib/types/database'

interface NotesTabProps {
  applicationId: string | null  // first active application id
  notes: ApplicationEvent[]     // events with event_type === 'note_added'
  onNoteAdded: () => void
}

export default function NotesTab({ applicationId, notes, onNoteAdded }: NotesTabProps) {
  const [text, setText] = useState('')
  const [saving, setSaving] = useState(false)

  const save = async () => {
    if (!applicationId || !text.trim()) return
    setSaving(true)
    await fetch(`/api/applications/${applicationId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ note: text.trim() }),
    })
    setText('')
    setSaving(false)
    onNoteAdded()
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {notes.length === 0 ? (
          <div className="flex flex-col items-center py-10 text-center">
            <FileText className="h-8 w-8 text-slate-200 mb-2" />
            <p className="text-sm text-slate-400">No notes yet</p>
          </div>
        ) : notes.map(n => (
          <div key={n.id} className="rounded-xl bg-amber-50 border border-amber-100 px-4 py-3">
            <p className="text-sm text-slate-700 whitespace-pre-line">{n.note}</p>
            <p className="text-[10px] text-slate-400 mt-1.5">{n.created_by} · {new Date(n.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</p>
          </div>
        ))}
      </div>
      {applicationId && (
        <div className="border-t border-slate-100 p-3">
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            rows={2}
            placeholder="Add a note…"
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          />
          <div className="flex justify-end mt-1.5">
            <button
              onClick={save}
              disabled={saving || !text.trim()}
              className="flex items-center gap-1.5 rounded-xl bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 transition-colors disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              Save Note
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
