'use client'

import { useCallback, useEffect, useState } from 'react'
import { GraduationCap, Target, Send, DollarSign, RefreshCw, ChevronRight } from 'lucide-react'
import { toast } from 'sonner'
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
export function LearningPanel({ jobId }: { jobId: string }) {
  const [d, setD] = useState<Diagnosis | null>(null)
  const [loading, setLoading] = useState(true)
  const [refining, setRefining] = useState(false)
  const [open, setOpen] = useState(false)

  const load = useCallback(() => {
    fetch(`/api/jobs/${jobId}/learning`)
      .then((r) => (r.ok ? r.json() : { data: null }))
      .then((j) => setD(j.data ?? null))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [jobId])
  useEffect(() => { load() }, [load])

  async function refine() {
    setRefining(true)
    const res = await fetch(`/api/jobs/${jobId}/icp/refine-from-feedback`, { method: 'POST' })
    setRefining(false)
    const body = await res.json().catch(() => ({}))
    if (!res.ok) { toast.error(body.error ?? 'Could not refine the ICP'); return }
    const data = body.data
    if (data?.status === 'insufficient') { toast(`${data.decided}/${data.needed} decisions so far — mark a few more Yes/No.`); return }
    if (data?.icp) toast.success(`Refined ICP draft v${data.icp.version}${data.change_summary ? `: ${data.change_summary}` : ''} — review it in Scoring.`)
  }

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

      {d.dominant === 'fit_miss' && (
        <Button size="sm" variant="outline" className="mt-2" onClick={refine} loading={refining}>
          <RefreshCw className="h-3.5 w-3.5" /> Refine ICP from fit feedback
        </Button>
      )}
      </>)}
    </div>
  )
}
