'use client'

import { useEffect, useState } from 'react'
import { Loader2, Users, X } from 'lucide-react'

interface Cand { id: string; name: string; email: string; current_title?: string | null }

export default function ManualEnrollPanel({ sequenceId, active, onPreviewChange, onEnrolled }: {
  sequenceId: string
  active: boolean
  onPreviewChange: (count: number | null, candidates: Cand[]) => void
  onEnrolled: () => void
}) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<Cand[]>([])
  const [searching, setSearching] = useState(false)
  const [selected, setSelected] = useState<Cand[]>([])
  const [enrolling, setEnrolling] = useState(false)
  const [result, setResult] = useState<{ enrolled: number; skipped: number } | null>(null)
  const [error, setError] = useState('')

  // Push the current selection to the left preview.
  useEffect(() => {
    if (selected.length === 0) onPreviewChange(null, [])
    else onPreviewChange(selected.length, selected)
  }, [selected, onPreviewChange])

  const search = async (v: string) => {
    setQ(v); setResult(null)
    if (v.length < 2) { setResults([]); return }
    setSearching(true)
    const res = await fetch(`/api/candidates?search=${encodeURIComponent(v)}&limit=10`)
    if (res.ok) setResults((await res.json()).data ?? [])
    setSearching(false)
  }

  const toggle = (c: Cand) => setSelected(prev => prev.find(x => x.id === c.id) ? prev.filter(x => x.id !== c.id) : [...prev, c])

  const enroll = async () => {
    if (selected.length === 0) return
    setEnrolling(true); setError('')
    const res = await fetch(`/api/sequences/${sequenceId}/enroll`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ candidate_ids: selected.map(c => c.id) }),
    })
    const json = await res.json()
    setEnrolling(false)
    if (!res.ok) { setError(json.error ?? 'Failed to enroll'); return }
    setResult({ enrolled: json.data?.enrolled_count ?? 0, skipped: json.data?.skipped_count ?? 0 })
    setSelected([]); setQ(''); setResults([])
    onEnrolled()
  }

  return (
    <div className="space-y-3">
      {!active && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-700">
          Activate the sequence before enrolling.
        </div>
      )}
      <input
        value={q}
        onChange={e => search(e.target.value)}
        placeholder="Search by name, email, or skills…"
        className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-800 placeholder-slate-400 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
      />

      {searching && <div className="flex items-center gap-2 text-sm text-slate-400"><Loader2 className="h-4 w-4 animate-spin" /> Searching…</div>}

      {results.length > 0 && (
        <div className="max-h-56 space-y-1 overflow-y-auto">
          {results.map(c => {
            const on = selected.some(x => x.id === c.id)
            return (
              <button key={c.id} onClick={() => toggle(c)}
                className={`flex w-full items-center gap-3 rounded-xl border-2 px-3 py-2 text-left transition-all ${on ? 'border-slate-500 bg-slate-50' : 'border-slate-200 hover:border-slate-300'}`}>
                <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${on ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
                  {c.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-800">{c.name}</p>
                  <p className="truncate text-xs text-slate-400">{c.email}{c.current_title ? ` · ${c.current_title}` : ''}</p>
                </div>
                {on && <span className="text-[11px] font-semibold text-emerald-600">Selected</span>}
              </button>
            )
          })}
        </div>
      )}

      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {selected.map(c => (
            <span key={c.id} className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
              {c.name}
              <button onClick={() => toggle(c)} className="text-emerald-500 hover:text-emerald-800"><X className="h-3 w-3" /></button>
            </span>
          ))}
        </div>
      )}

      {error && <p className="text-xs font-medium text-red-500">{error}</p>}
      {result && <p className="text-sm font-semibold text-emerald-700">Enrolled {result.enrolled} · skipped {result.skipped} (already in)</p>}

      <button
        onClick={enroll}
        disabled={enrolling || selected.length === 0 || !active}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#221b14] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#33271b] disabled:opacity-50"
      >
        {enrolling ? <Loader2 className="h-4 w-4 animate-spin" /> : <Users className="h-4 w-4" />}
        Enroll {selected.length > 0 ? `(${selected.length})` : ''}
      </button>
    </div>
  )
}
