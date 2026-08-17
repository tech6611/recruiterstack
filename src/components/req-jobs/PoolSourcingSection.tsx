'use client'

import { useEffect, useState } from 'react'
import { Globe, Lock, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'

interface PoolMatch {
  profile_id: string
  name: string | null
  current_title: string | null
  current_company: string | null
  location: string | null
  reachable: boolean
  score: number
  fit_bucket: string
  rationale: string
  gate_failures: string[]
}

const BUCKET: Record<string, { label: string; cls: string }> = {
  great: { label: 'Great fit', cls: 'bg-emerald-100 text-emerald-700' },
  good: { label: 'Good fit', cls: 'bg-sky-100 text-sky-700' },
  okay: { label: 'Okay fit', cls: 'bg-amber-100 text-amber-700' },
}

/** Sourcing Brain — ICP-ranked sourcing over the cross-org Candidate Pool (Pool B),
 *  with unlock-&-add-to-pipeline. Lives in the Source tab; the pool itself is filled
 *  and browsed elsewhere. */
export function PoolSourcingSection({ jobId }: { jobId: string }) {
  const [state, setState] = useState<'idle' | 'loading' | 'ok' | 'no_access' | 'empty'>('idle')
  const [matches, setMatches] = useState<PoolMatch[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [adding, setAdding] = useState(false)
  const [stale, setStale] = useState(false)

  // Load the cached market shortlist so it survives a refresh (no re-scoring).
  useEffect(() => {
    fetch(`/api/jobs/${jobId}/source/pool`)
      .then((r) => (r.ok ? r.json() : { data: { matches: [] } }))
      .then((j) => {
        const m = j.data?.matches ?? []
        if (m.length) { setMatches(m); setStale(!!j.data?.stale); setState('ok') }
      })
      .catch(() => {})
  }, [jobId])

  async function search() {
    setState('loading')
    const res = await fetch(`/api/jobs/${jobId}/source/pool`, { method: 'POST' })
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      toast.error(j.error ?? 'Could not search the market')
      setState('idle')
      return
    }
    const { data } = await res.json()
    if (data.status === 'no_access') { setState('no_access'); return }
    setStale(false)
    setMatches(data.matches ?? [])
    setState((data.matches ?? []).length ? 'ok' : 'empty')
  }

  async function startTrial() {
    const res = await fetch('/api/pool', { method: 'POST' })
    if (res.ok) { toast.success('Market access trial started — search again.'); setState('idle') }
    else toast.error('Could not start the trial')
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function unlockAndAdd() {
    if (selected.size === 0) return
    setAdding(true)
    const res = await fetch(`/api/jobs/${jobId}/source/pool/add`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profile_ids: Array.from(selected) }),
    })
    setAdding(false)
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      toast.error(j.error ?? 'Could not unlock these profiles')
      return
    }
    const { data } = await res.json()
    if (data.quota_exceeded) toast.error('Unlock quota reached — upgrade to unlock more.')
    else toast.success(`Unlocked ${data.unlocked} · added ${data.added} to the pipeline.`)
    setMatches((m) => m.filter((x) => !selected.has(x.profile_id)))
    setSelected(new Set())
  }

  return (
    <div className="border-t border-slate-100 px-6 py-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
          <Globe className="h-4 w-4 text-sky-600" /> From the market <span className="text-xs font-normal text-slate-400">(Candidate Pool)</span>
        </div>
        {state !== 'no_access' && (
          <Button size="sm" variant="outline" onClick={search} loading={state === 'loading'}>
            <Sparkles className="h-3.5 w-3.5" /> {state === 'idle' ? 'Search the market' : 'Re-search'}
          </Button>
        )}
      </div>

      {state === 'no_access' && (
        <div className="mt-3 rounded-lg border border-dashed border-slate-300 p-4 text-center">
          <p className="text-xs text-slate-500">Search beyond your own candidates — the cross-org Candidate Pool, ranked against this job’s ICP.</p>
          <Button size="sm" className="mt-2" onClick={startTrial}><Lock className="h-3.5 w-3.5" /> Start a free trial (25 unlocks)</Button>
        </div>
      )}

      {state === 'empty' && <p className="mt-3 text-xs text-slate-400">No market matches yet — the pool may still be filling, or none fit this ICP.</p>}

      {state === 'ok' && stale && (
        <p className="mt-2 text-[11px] text-amber-600">The ICP has changed since this search — re-search for fresh matches.</p>
      )}

      {state === 'ok' && (
        <div className="mt-3 space-y-2">
          {matches.map((m) => (
            <label key={m.profile_id} className="flex cursor-pointer items-start gap-2 rounded-lg border border-slate-200 p-3 hover:bg-slate-50">
              <input type="checkbox" checked={selected.has(m.profile_id)} onChange={() => toggle(m.profile_id)} className="mt-1 h-3.5 w-3.5" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium text-slate-800">{m.name ?? 'Candidate'}</span>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${BUCKET[m.fit_bucket]?.cls ?? 'bg-slate-100 text-slate-600'}`}>{BUCKET[m.fit_bucket]?.label ?? 'Fit'}</span>
                  <span className="shrink-0 text-xs font-bold text-slate-500">{m.score}</span>
                  {!m.reachable && <span className="shrink-0 text-[10px] text-amber-600">no contact</span>}
                </div>
                <div className="truncate text-[11px] text-slate-400">
                  {[m.current_title, m.current_company].filter(Boolean).join(' · ')}{m.location ? ` — ${m.location}` : ''}
                </div>
                {m.rationale && <div className="mt-1 line-clamp-2 text-[11px] text-slate-500">{m.rationale}</div>}
                {m.gate_failures.length > 0 && <div className="text-[11px] text-red-600">Missing: {m.gate_failures.join(', ')}</div>}
              </div>
            </label>
          ))}
          {selected.size > 0 && (
            <div className="flex items-center justify-between pt-1">
              <span className="text-xs text-slate-500">{selected.size} selected</span>
              <Button size="sm" onClick={unlockAndAdd} loading={adding}>
                <Lock className="h-3.5 w-3.5" /> Unlock &amp; add to pipeline
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
