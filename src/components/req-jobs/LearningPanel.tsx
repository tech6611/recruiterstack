'use client'

import { useCallback, useEffect, useState } from 'react'
import { GraduationCap, Target, Send, DollarSign, RefreshCw, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface Diagnosis {
  total: number
  decided: number
  breakdown: Record<string, number>
  dominant: 'fit_miss' | 'no_reply' | 'declined_offer' | null
  guidance: string
}

const MODES: { key: 'fit_miss' | 'no_reply' | 'declined_offer'; label: string; icon: typeof Target; cls: string }[] = [
  { key: 'fit_miss', label: 'Fit', icon: Target, cls: 'text-rose-600' },
  { key: 'no_reply', label: 'Reachability', icon: Send, cls: 'text-amber-600' },
  { key: 'declined_offer', label: 'Movability', icon: DollarSign, cls: 'text-sky-600' },
]

/** Sourcing Brain, Slice 3 — separate fit / reachability / movability so the loop
 *  fixes the right thing (only fit misses should refine the ICP). */
export function LearningPanel({ jobId, onOpenScoring }: { jobId: string; onOpenScoring?: () => void }) {
  const [d, setD] = useState<Diagnosis | null>(null)
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)

  const load = useCallback(() => {
    fetch(`/api/jobs/${jobId}/learning`)
      .then((r) => (r.ok ? r.json() : { data: null }))
      .then((j) => setD(j.data ?? null))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [jobId])
  useEffect(() => { load() }, [load])

  if (loading || !d || d.decided === 0) return null

  return (
    <div className="border-t border-slate-100 px-6 py-4">
      <button type="button" onClick={() => setOpen((v) => !v)} className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-slate-700">
        <ChevronRight className={`h-4 w-4 text-slate-400 transition-transform ${open ? 'rotate-90' : ''}`} />
        <GraduationCap className="h-4 w-4 text-indigo-500" /> What the pipeline is teaching you
      </button>

      {open && (<>
      <div className="grid grid-cols-3 gap-2">
        {MODES.map((m) => {
          const n = d.breakdown[m.key] ?? 0
          const isDom = d.dominant === m.key && n > 0
          const Icon = m.icon
          return (
            <div key={m.key} className={`rounded-lg border p-2.5 text-center ${isDom ? 'border-slate-300 bg-slate-50' : 'border-slate-200'}`}>
              <Icon className={`mx-auto h-4 w-4 ${m.cls}`} />
              <div className="mt-1 text-lg font-bold text-slate-800">{n}</div>
              <div className="text-[10px] uppercase tracking-wide text-slate-400">{m.label}</div>
            </div>
          )
        })}
      </div>

      <p className="mt-3 text-xs leading-relaxed text-slate-600">{d.guidance}</p>

      {/* The one Refine button lives on the Scoring tab; this points there. */}
      {d.dominant === 'fit_miss' && onOpenScoring && (
        <Button size="sm" variant="outline" className="mt-2" onClick={onOpenScoring}>
          <RefreshCw className="h-3.5 w-3.5" /> Refine the ICP on Scoring →
        </Button>
      )}
      </>)}
    </div>
  )
}
