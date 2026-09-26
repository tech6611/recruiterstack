'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Globe, Lock, Sparkles, ChevronRight, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { SourcingMatrix, type MatrixIcp, type MatrixMatch } from '@/components/req-jobs/SourcingMatrix'
import { SearchSpecEditor, type LevelRunStat } from '@/components/req-jobs/SearchSpecEditor'
import { AdaptivePlanPanel } from '@/components/req-jobs/AdaptivePlanPanel'
import { PoolProfilePanel } from '@/components/req-jobs/PoolProfilePanel'
import { unexpectedGateFailures } from '@/lib/icp-gates'

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
  gate_reasons?: Record<string, string>
  tags?: string[]
  education_summary?: string | null
  starred?: boolean
  hidden?: boolean
  outside_plan?: string | null
  pending?: boolean
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
    tags: m.tags ?? [],
    gate_reasons: m.gate_reasons ?? {},
    education_summary: m.education_summary ?? null,
    experience_years: m.experience_years ?? null,
    current_tenure_months: m.current_tenure_months ?? null,
    starred: !!m.starred,
    hidden: !!m.hidden,
    outside_plan: m.outside_plan ?? null,
    pending: !!m.pending,
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
  // Bumped after the adaptive planner applies a new plan, to remount the SearchSpecEditor.
  const [specKey, setSpecKey] = useState(0)
  const [sourcing, setSourcing] = useState(false)
  // How many just-found people the Fit Engine is still scoring (0 = none).
  const [scoring, setScoring] = useState(0)
  // The last Crustdata run's search plan + which profiles it brought in.
  const [plan, setPlan] = useState<SearchPlanReport | null>(null)
  const [newIds, setNewIds] = useState<Set<string>>(new Set())
  const [showHidden, setShowHidden] = useState(false)
  const [showOutside, setShowOutside] = useState(false)
  const [showFailed, setShowFailed] = useState(false)
  // Ideal-profile ladder: a miss on a dimension the person's level deliberately relaxed
  // (companies at L2, titles at L3, location at L4) is expected, not a failure to fold.
  const relaxAt = Object.fromEntries((icp?.must_haves ?? []).map((g) => [g.label, g.relax_at ?? null]))
  const misses = (m: PoolMatch) => unexpectedGateFailures(m.gate_failures ?? [], m.acquired?.level ?? null, relaxAt).length
  const [openProfile, setOpenProfile] = useState<string | null>(null)

  /** Star / hide: free, persisted on the cached list, survives re-ranks. */
  async function setFlag(profileId: string, flags: { starred?: boolean; hidden?: boolean }) {
    setMatches((prev) => prev.map((m) => (m.profile_id === profileId ? { ...m, ...flags } : m)))
    const res = await fetch(`/api/jobs/${jobId}/source/pool/matches`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ profile_id: profileId, ...flags }) })
    if (!res.ok) toast.error('Could not save that')
  }

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

  // Pull NEW people from Crustdata for this ICP and show them at once (unscored), then
  // score just those in a second call while the recruiter is already reading the list.
  async function sourceFromCrustdata() {
    setSourcing(true)
    const res = await fetch(`/api/jobs/${jobId}/source/crustdata`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ score: false }) })
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
    const s = data.sourced
    setPlan(s?.plan ?? null)
    setNewIds(new Set<string>(s?.profileIds ?? []))
    setIcp(data.icp ?? null)
    const lanes = s?.plan?.results?.length ?? 0
    toast.success(`${s?.fetched ?? 0} people found across ${lanes} level${lanes === 1 ? '' : 's'} · ${(s?.creditsUsed ?? 0).toFixed(2)} credits`)

    // The new people go on top, marked as still being scored; everyone else stays as scored.
    const fresh: PoolMatch[] = data.matches ?? []
    if (!fresh.length) return
    const freshIds = new Set(fresh.map((m) => m.profile_id))
    setMatches((prev) => [...fresh, ...prev.filter((m) => !freshIds.has(m.profile_id))])
    setState('ok')
    setScoring(fresh.length)

    const scored = await fetch(`/api/jobs/${jobId}/source/pool`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ newProfileIds: s?.profileIds ?? [] }) })
    setScoring(0)
    if (!scored.ok) {
      toast.error('Found the people, but scoring them failed — click Re-rank to try again.')
      return
    }
    const { data: ranked } = await scored.json()
    if (ranked.status === 'no_access') { setState('no_access'); return }
    setStale(false)
    setMatches(ranked.matches ?? [])
    setState((ranked.matches ?? []).length ? 'ok' : 'empty')
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
              <Button size="sm" variant="ghost" onClick={search} loading={state === 'loading'} title="Re-rank everyone already in the pool against the ICP — no acquisition">
                <Sparkles className="h-3.5 w-3.5" /> {state === 'idle' ? 'Rank the pool' : 'Re-rank'}
              </Button>
            </>
          )}
        </div>
      </div>
      {open && (<>
      {state !== 'no_access' && (<>
        <SearchSpecEditor key={specKey} jobId={jobId} onFind={sourceFromCrustdata} finding={sourcing}
          lastRun={plan?.results.map((r): LevelRunStat => ({ key: r.key, fetched: r.fetched, total: r.total, exhausted: r.exhausted, error: r.error })) ?? null} />
        <AdaptivePlanPanel jobId={jobId} onApplied={() => setSpecKey((k) => k + 1)} />
      </>)}
      {state === 'no_access' && (
        <div className="mt-3 rounded-lg border border-dashed border-slate-300 p-4 text-center">
          <p className="text-xs text-slate-500">Search beyond your own candidates — the cross-org Candidate Pool, ranked against this job’s ICP.</p>
          <Button size="sm" className="mt-2" onClick={startTrial}><Lock className="h-3.5 w-3.5" /> Start a free trial (25 unlocks)</Button>
        </div>
      )}

      {state === 'empty' && <p className="mt-3 text-xs text-slate-400">No market matches yet — the pool may still be filling, or none fit this ICP.</p>}

      {scoring > 0 && (
        <p className="mt-2 flex items-center gap-1.5 text-[11px] text-slate-500">
          <Loader2 className="h-3 w-3 animate-spin" /> Scoring {scoring} new {scoring === 1 ? 'person' : 'people'} against the ICP…
        </p>
      )}

      {state === 'ok' && stale && (
        <p className="mt-2 text-[11px] text-amber-600">The ICP has changed since this search — re-search for fresh matches.</p>
      )}

      {state === 'ok' && (
        <div className="mt-3 space-y-2">
          {icp ? (
            <>
              {(() => {
                const hidden = matches.filter((m) => m.hidden).length
                const outside = matches.filter((m) => !m.hidden && m.outside_plan).length
                // Failed a must-have: folded by default. Unknown (?) gates stay visible — unanswerable ≠ unfit.
                const failed = matches.filter((m) => !m.hidden && !m.outside_plan && misses(m) > 0).length
                return (hidden > 0 || outside > 0 || failed > 0) ? (
                  <div className="flex items-center gap-3 text-[11px] text-slate-400">
                    {failed > 0 && <button type="button" onClick={() => setShowFailed((v) => !v)} className="hover:text-slate-600" title="Scored, but fails at least one must-have">{showFailed ? 'Hide' : 'Show'} {failed} who miss a must-have</button>}
                    {outside > 0 && <button type="button" onClick={() => setShowOutside((v) => !v)} className="hover:text-slate-600" title="Already in your pool but outside the plan's location or years">{showOutside ? 'Hide' : 'Show'} {outside} elsewhere in your pool</button>}
                    {hidden > 0 && <button type="button" onClick={() => setShowHidden((v) => !v)} className="hover:text-slate-600">{showHidden ? 'Hide' : 'Show'} {hidden} hidden</button>}
                  </div>
                ) : null
              })()}
              <SourcingMatrix
                matches={matches.filter((m) => (showHidden || !m.hidden) && (showOutside || !m.outside_plan) && (showFailed || misses(m) === 0)).map((m) => toMatrixMatch(m, newIds))}
                icp={icp} selected={selected} onToggle={toggle}
                onStar={(id, starred) => setFlag(id, { starred })}
                onHide={(id) => setFlag(id, { hidden: true })}
                onOpenProfile={(id) => setOpenProfile(id)}
              />
              {openProfile && <PoolProfilePanel profileId={openProfile} tags={matches.find((m) => m.profile_id === openProfile)?.tags} onClose={() => setOpenProfile(null)} />}
            </>
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
