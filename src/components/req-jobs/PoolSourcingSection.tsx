'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Globe, Lock, Sparkles, ChevronRight } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { SourcingMatrix, type MatrixIcp, type MatrixMatch } from '@/components/req-jobs/SourcingMatrix'

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
  competencies?: { name: string; rating: number; evidence?: string }[]
  red_flags?: string[]
}

/** Map a market (Pool B) profile onto the shared matrix row shape. */
function toMatrixMatch(m: PoolMatch): MatrixMatch {
  return {
    candidate_id: m.profile_id,
    score: m.score,
    gate_failures: (m.gate_failures ?? []).map((label) => ({ label })),
    red_flags: m.red_flags ?? [],
    rationale: m.rationale ?? null,
    competencies: m.competencies ?? [],
    unreachable: !m.reachable,
    skills: m.skills ?? [],
    decision: null,
    candidate: {
      id: m.profile_id,
      name: m.name,
      current_title: m.current_title,
      current_company: m.current_company,
      location: m.location,
    },
  }
}

/** Sourcing Brain — ICP-ranked sourcing over the cross-org Candidate Pool (Pool B),
 *  with unlock-&-add-to-pipeline. Lives in the Source tab; the pool itself is filled
 *  and browsed elsewhere. */
export function PoolSourcingSection({ jobId }: { jobId: string }) {
  const [state, setState] = useState<'idle' | 'loading' | 'ok' | 'no_access' | 'empty'>('idle')
  const [matches, setMatches] = useState<PoolMatch[]>([])
  const [icp, setIcp] = useState<MatrixIcp | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [adding, setAdding] = useState(false)
  const [stale, setStale] = useState(false)
  const [open, setOpen] = useState(false)

  // Load the cached market shortlist so it survives a refresh (no re-scoring).
  useEffect(() => {
    fetch(`/api/jobs/${jobId}/source/pool`)
      .then((r) => (r.ok ? r.json() : { data: { matches: [] } }))
      .then((j) => {
        setIcp(j.data?.icp ?? null)
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
    setIcp(data.icp ?? null)
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
    else {
      toast.success(`Unlocked ${data.unlocked} · added ${data.added} to the pipeline.`)
      if (data.no_contact) toast(`${data.no_contact} skipped — no contact details, so no credit spent.`)
      if (data.no_email) toast(`${data.no_email} had no email on file — reach out via LinkedIn or find their email before sequencing.`)
    }
    setMatches((m) => m.filter((x) => !selected.has(x.profile_id)))
    setSelected(new Set())
  }

  return (
    <div className="border-t border-slate-100 px-6 py-4">
      <div className="flex items-center justify-between gap-2">
        <button type="button" onClick={() => setOpen((v) => !v)} className="flex items-center gap-1.5 text-sm font-semibold text-slate-700">
          <ChevronRight className={`h-4 w-4 text-slate-400 transition-transform ${open ? 'rotate-90' : ''}`} />
          <Globe className="h-4 w-4 text-sky-600" /> From the market <span className="text-xs font-normal text-slate-400">(Candidate Pool)</span>
          {matches.length > 0 && <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">{matches.length}</span>}
        </button>
        <div className="flex items-center gap-2">
          <Link href="/pool/usage" className="text-[11px] text-slate-400 hover:text-slate-600">Unlock usage</Link>
          {state !== 'no_access' && (
            <Button size="sm" variant="outline" onClick={search} loading={state === 'loading'}>
              <Sparkles className="h-3.5 w-3.5" /> {state === 'idle' ? 'Search the market' : 'Re-search'}
            </Button>
          )}
        </div>
      </div>
      {open && (<>

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
          {icp ? (
            <SourcingMatrix matches={matches.map(toMatrixMatch)} icp={icp} selected={selected} onToggle={toggle} />
          ) : (
            <div className="rounded-xl border border-dashed border-slate-300 p-4 text-center text-xs text-slate-400">
              Loading the ICP’s ranking parameters…
            </div>
          )}
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
      </>)}
    </div>
  )
}
