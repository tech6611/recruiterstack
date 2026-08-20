'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Globe, Lock, Sparkles, Building2, Clock, TrendingUp, MapPin } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { fitBucketFor } from '@/lib/ai/fit-bucket'

interface PoolMatch {
  profile_id: string
  name: string | null
  current_title: string | null
  current_company: string | null
  location: string | null
  reachable: boolean
  experience_years: number | null
  total_experience_months: number | null
  current_tenure_months: number | null
  skills: string[]
  score: number
  fit_bucket: string
  rationale: string
  gate_failures: string[]
}

const BUCKET: Record<string, { label: string; cls: string; fill: string }> = {
  great: { label: 'Great fit', cls: 'bg-emerald-100 text-emerald-700', fill: 'bg-emerald-500' },
  good: { label: 'Good fit', cls: 'bg-sky-100 text-sky-700', fill: 'bg-sky-500' },
  okay: { label: 'Okay fit', cls: 'bg-amber-100 text-amber-700', fill: 'bg-amber-500' },
  weak: { label: 'Weak fit', cls: 'bg-rose-100 text-rose-700', fill: 'bg-rose-500' },
}

function initials(name: string | null): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean)
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?'
}
function years(m: PoolMatch): string | null {
  const mo = m.total_experience_months ?? (m.experience_years != null ? m.experience_years * 12 : null)
  if (mo == null) return null
  const y = Math.round(mo / 12)
  return y > 0 ? `${y} yr${y === 1 ? '' : 's'} total` : null
}
function tenure(m: PoolMatch): string | null {
  if (m.current_tenure_months == null) return null
  const y = Math.floor(m.current_tenure_months / 12), mo = m.current_tenure_months % 12
  const s = y ? `${y}y${mo ? ` ${mo}m` : ''}` : `${mo}m`
  return `${s} in role`
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
        <div className="flex items-center gap-2">
          <Link href="/pool/usage" className="text-[11px] text-slate-400 hover:text-slate-600">Unlock usage</Link>
          {state !== 'no_access' && (
            <Button size="sm" variant="outline" onClick={search} loading={state === 'loading'}>
              <Sparkles className="h-3.5 w-3.5" /> {state === 'idle' ? 'Search the market' : 'Re-search'}
            </Button>
          )}
        </div>
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
          {matches.map((m) => {
            // Derive the band from the score so a stale cached label can't misread a low score.
            const bucket = fitBucketFor(m.score, (m.gate_failures?.length ?? 0) === 0)
            const b = BUCKET[bucket]
            const sel = selected.has(m.profile_id)
            const yrs = years(m), ten = tenure(m)
            return (
              <div key={m.profile_id} onClick={() => toggle(m.profile_id)}
                className={`cursor-pointer rounded-xl border p-3.5 transition hover:bg-slate-50/60 ${sel ? 'border-sky-300 ring-1 ring-sky-200' : 'border-slate-200'}`}>
                <div className="flex items-start gap-3">
                  <input type="checkbox" checked={sel} onChange={() => toggle(m.profile_id)} onClick={(e) => e.stopPropagation()} className="mt-1.5 h-3.5 w-3.5" />
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-sky-50 text-xs font-bold text-sky-700">{initials(m.name)}</div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-slate-800">{m.name ?? 'Candidate'}</div>
                    <div className="truncate text-xs text-slate-500">{m.current_title ?? '—'}</div>
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${b?.cls ?? 'bg-slate-100 text-slate-600'}`}>{b?.label ?? 'Fit'}</span>
                </div>

                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {m.current_company && <span className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] text-slate-600"><Building2 className="h-3 w-3 text-slate-400" />{m.current_company}</span>}
                  {yrs && <span className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] text-slate-600"><Clock className="h-3 w-3 text-slate-400" />{yrs}</span>}
                  {ten && <span className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] text-slate-600"><TrendingUp className="h-3 w-3 text-slate-400" />{ten}</span>}
                  {m.location && <span className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] text-slate-600"><MapPin className="h-3 w-3 text-slate-400" />{m.location}</span>}
                  {!m.reachable && <span className="rounded-md bg-amber-50 px-2 py-0.5 text-[11px] text-amber-600">no contact</span>}
                </div>

                <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-slate-100">
                  <div className={`h-full rounded-full ${b?.fill ?? 'bg-slate-400'}`} style={{ width: `${Math.max(3, Math.min(100, m.score))}%` }} />
                </div>
                <div className="mt-1 flex justify-between text-[10px] text-slate-400"><span>Fit vs ICP</span><span className="font-semibold text-slate-600">{m.score} / 100</span></div>

                {(m.skills?.length ?? 0) > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {m.skills.slice(0, 5).map((s, i) => <span key={i} className="rounded bg-sky-50 px-1.5 py-0.5 text-[10px] text-sky-600">{s}</span>)}
                  </div>
                )}
                {m.rationale && <div className="mt-2 line-clamp-2 text-[11px] text-slate-500">{m.rationale}</div>}
                {m.gate_failures.length > 0 && <div className="mt-1 text-[11px] text-rose-600">Missing: {m.gate_failures.join(', ')}</div>}
              </div>
            )
          })}
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
