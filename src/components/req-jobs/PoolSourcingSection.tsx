'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Globe, Lock, Sparkles, ChevronRight, Radar, ListTree } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { SourcingMatrix, type MatrixIcp, type MatrixMatch } from '@/components/req-jobs/SourcingMatrix'
import { SearchSpecEditor } from '@/components/req-jobs/SearchSpecEditor'

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
  gate_unknown?: string[]
  sources?: string[]
  acquired?: { level: number; label: string } | null
}

/** What the last acquisition run did, lane by lane (from POST /source/crustdata). */
interface SearchPlanReport {
  lanes: { key: string; kind: string; label: string; summary: string[]; rationale: string | null }[]
  common: string[]
  unmapped: { requirement: string; reason: string }[]
  results: { key: string; label: string; total: number | null; fetched: number; duplicates: number; creditsUsed: number; resumed: boolean; exhausted?: boolean; error?: string | null }[]
}

const SOURCE_BADGE: Record<string, string> = { 'vendor:crustdata': 'Crustdata', 'upload:cv': 'CV upload', github: 'GitHub' }

/** Map a market (Pool B) profile onto the shared matrix row shape. */
function toMatrixMatch(m: PoolMatch, newIds?: Set<string>): MatrixMatch {
  const badge = (m.sources ?? []).map((k) => SOURCE_BADGE[k]).find(Boolean) ?? null
  return {
    candidate_id: m.profile_id,
    score: m.score,
    gate_failures: (m.gate_failures ?? []).map((label) => ({ label })),
    gate_unknown: (m.gate_unknown ?? []).map((label) => ({ label })),
    source_badge: badge ? (newIds?.has(m.profile_id) ? `${badge} · new` : badge) : null,
    level_badge: m.acquired ? `L${m.acquired.level}${m.acquired.level === 1 ? ' · full match' : ''}` : null,
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
  const [sourcing, setSourcing] = useState(false)
  // The last Crustdata run's search plan + which profiles it brought in.
  const [plan, setPlan] = useState<SearchPlanReport | null>(null)
  const [newIds, setNewIds] = useState<Set<string>>(new Set())

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

  // Pull NEW people from Crustdata for this ICP, then re-rank the refreshed pool.
  async function sourceFromCrustdata() {
    setSourcing(true)
    const res = await fetch(`/api/jobs/${jobId}/source/crustdata`, { method: 'POST' })
    setSourcing(false)
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      if (res.status === 409 || j.code === 'source_disabled') {
        toast('Crustdata sourcing isn’t switched on for your workspace yet.')
        return
      }
      toast.error(j.error ?? 'Could not source from Crustdata')
      return
    }
    const { data } = await res.json()
    if (data.status === 'no_access') { setState('no_access'); return }
    setStale(false)
    setIcp(data.icp ?? null)
    setMatches(data.matches ?? [])
    setState((data.matches ?? []).length ? 'ok' : 'empty')
    const s = data.sourced
    setPlan(s?.plan ?? null)
    setNewIds(new Set<string>(s?.profileIds ?? []))
    const lanes = s?.plan?.results?.length ?? 0
    toast.success(`Searched ${lanes} level${lanes === 1 ? '' : 's'} — ${s?.fetched ?? 0} profile(s) fetched, ${s?.created ?? 0} new to the pool (${(s?.creditsUsed ?? 0).toFixed(2)} credits).`)
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
            <>
              <Button size="sm" variant="outline" onClick={sourceFromCrustdata} loading={sourcing}>
                <Radar className="h-3.5 w-3.5" /> Find people
              </Button>
              <Button size="sm" variant="outline" onClick={search} loading={state === 'loading'}>
                <Sparkles className="h-3.5 w-3.5" /> {state === 'idle' ? 'Search the market' : 'Re-search'}
              </Button>
            </>
          )}
        </div>
      </div>
      {open && (<>
      {state !== 'no_access' && <SearchSpecEditor jobId={jobId} />}
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

      {plan && (
        <div className="mt-3 rounded-xl border border-sky-200 bg-sky-50/50 px-3 py-2.5">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
            <ListTree className="h-3.5 w-3.5 text-sky-600" /> What the last run searched, level by level
          </div>
          {plan.common.length > 0 && (
            <div className="mt-1 text-[11px] text-slate-500">Every lane: {plan.common.join(' · ')}</div>
          )}
          <ol className="mt-2 space-y-1.5">
            {plan.lanes.map((lane, i) => {
              const r = plan.results.find((x) => x.key === lane.key)
              return (
                <li key={lane.key} className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium text-slate-800">{i + 1}. {lane.label} <span className="font-normal text-slate-400">({lane.kind})</span></span>
                    {r && (
                      <span className="text-[11px] text-slate-500">
                        {r.error ? <span className="text-rose-600">failed: {r.error}</span> : <>
                          {r.total != null ? `${r.total.toLocaleString()} match${r.total === 1 ? '' : 'es'}` : 'matches n/a'} · fetched {r.fetched}
                          {r.duplicates > 0 && ` (+${r.duplicates} already seen)`} · {r.creditsUsed.toFixed(2)} cr{r.resumed ? ' · resumed' : ''}{r.exhausted ? ' · exhausted' : ''}
                        </>}
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 flex flex-wrap gap-1">
                    {lane.summary.map((sm) => <span key={sm} className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600">{sm}</span>)}
                  </div>
                </li>
              )
            })}
          </ol>
          {plan.unmapped.length > 0 && (
            <div className="mt-2 text-[11px] text-slate-500">
              <span className="font-medium text-slate-600">Checked after fetch, not searchable:</span>{' '}
              {plan.unmapped.map((u) => u.requirement).join(' · ')}
            </div>
          )}
        </div>
      )}

      {state === 'ok' && (
        <div className="mt-3 space-y-2">
          {icp ? (
            <SourcingMatrix matches={matches.map((m) => toMatrixMatch(m, newIds))} icp={icp} selected={selected} onToggle={toggle} />
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
