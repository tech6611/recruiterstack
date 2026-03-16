'use client'
import { useState } from 'react'
import { X, Plus } from 'lucide-react'
import type { CandidateTag } from '@/lib/types/database'

interface TagInputProps {
  candidateId: string
  tags: CandidateTag[]
  onTagAdded: (tag: CandidateTag) => void
  onTagRemoved: (tagId: string) => void
}

export default function TagInput({ candidateId, tags, onTagAdded, onTagRemoved }: TagInputProps) {
  const [input, setInput] = useState('')
  const [adding, setAdding] = useState(false)
  const [showInput, setShowInput] = useState(false)

  const add = async () => {
    const tag = input.trim().toLowerCase()
    if (!tag) return
    setAdding(true)
    const res = await fetch(`/api/candidates/${candidateId}/tags`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tag }),
    })
    if (res.ok) {
      const json = await res.json()
      onTagAdded(json.data)
      setInput('')
      setShowInput(false)
    }
    setAdding(false)
  }

  const remove = async (tagId: string) => {
    await fetch(`/api/candidates/${candidateId}/tags/${tagId}`, { method: 'DELETE' })
    onTagRemoved(tagId)
  }

  return (
    <div className="flex flex-wrap gap-1.5 items-center">
      {tags.map(t => (
        <span key={t.id} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600 group/tag">
          {t.tag}
          <button onClick={() => remove(t.id)} className="opacity-0 group-hover/tag:opacity-100 text-slate-400 hover:text-red-500 transition-all">
            <X className="h-2.5 w-2.5" />
          </button>
        </span>
      ))}
      {showInput ? (
        <div className="flex items-center gap-1">
          <input
            autoFocus
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') add(); if (e.key === 'Escape') setShowInput(false) }}
            placeholder="Tag name"
            className="w-20 rounded border border-slate-200 px-1.5 py-0.5 text-[11px] outline-none focus:border-blue-400"
          />
          <button onClick={add} disabled={adding || !input.trim()} className="text-[10px] font-semibold text-blue-600 hover:text-blue-800 disabled:opacity-50">Add</button>
          <button onClick={() => { setShowInput(false); setInput('') }} className="text-[10px] text-slate-400 hover:text-slate-600">✕</button>
        </div>
      ) : (
        <button onClick={() => setShowInput(true)} className="inline-flex items-center gap-0.5 rounded-full border border-dashed border-slate-300 px-2 py-0.5 text-[11px] text-slate-400 hover:border-slate-400 hover:text-slate-600 transition-colors">
          <Plus className="h-2.5 w-2.5" /> Add tag
        </button>
      )}
    </div>
  )
}
