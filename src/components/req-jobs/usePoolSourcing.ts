'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import type { MatrixIcp, MatrixMatch } from '@/components/req-jobs/SourcingMatrix'
import type { LevelRunStat } from '@/components/req-jobs/SearchSpecEditor'
import { unexpectedGateFailures } from '@/lib/icp-gates'

export interface PoolMatch {
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
export function toMatrixMatch(m: PoolMatch, newIds?: Set<string>): MatrixMatch {
  const badge = (m.sources ?? []).map((k) => SOURCE_BADGE[k]).find(Boolean) ?? null
  return {
    candidate_id: m.profile_id,
    score: m.score,
    gate_failures: (m.gate_failures ?? []).map((label) => ({ label })),
    gate_unknown: (m.gate_unknown ?? []).map((label) => ({ label })),
    // Market rows share the table with your own candidates, so they are always marked.
    source_badge: `${badge ?? 'Market'}${newIds?.has(m.profile_id) ? ' · new' : ''}`,
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
    row_kind: 'market',
    candidate: {
      id: m.profile_id,
      name: m.name,
      current_title: m.current_title,
      current_company: m.current_company,
      location: m.location,
    },
  }
}

/**
 * The market pocket (Pool B) — its data and actions, with no UI of its own. The Source
 * tab shows these people in the SAME results table as your own candidates (One of Each,
 * stage 3); this hook keeps the market's loading, scoring, star/hide and unlock logic.
 */
export function usePoolSourcing(jobId: string) {
  const [state, setState] = useState<'idle' | 'loading' | 'ok' | 'no_access' | 'empty'>('idle')
  const [matches, setMatches] = useState<PoolMatch[]>([])
  const [icp, setIcp] = useState<MatrixIcp | null>(null)
  const [adding, setAdding] = useState(false)
  const [stale, setStale] = useState(false)
  const [finding, setFinding] = useState(false)
  // How many just-found people the Fit Engine is still scoring (0 = none).
  const [scoring, setScoring] = useState(0)
  // The last Crustdata run's search plan + which profiles it brought in.
  const [plan, setPlan] = useState<SearchPlanReport | null>(null)
  const [newIds, setNewIds] = useState<Set<string>>(new Set())
  // Ideal-profile ladder: a miss on a dimension the person's level deliberately relaxed
  // (companies at L2, titles at L3, location at L4) is expected, not a failure to fold.
  const relaxAt = Object.fromEntries((icp?.must_haves ?? []).map((g) => [g.label, g.relax_at ?? null]))
  const misses = (m: PoolMatch) => unexpectedGateFailures(m.gate_failures ?? [], m.acquired?.level ?? null, relaxAt).length

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

  /** Re-rank everyone already in the market pool against the ICP (no acquisition). */
  async function rank(): Promise<number | null> {
    setState('loading')
    const res = await fetch(`/api/jobs/${jobId}/source/pool`, { method: 'POST' })
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      toast.error(j.error ?? 'Could not rank the market pool')
      setState('idle')
      return null
    }
    const { data } = await res.json()
    if (data.status === 'no_access') { setState('no_access'); return null }
    setStale(false)
    setIcp(data.icp ?? null)
    setMatches(data.matches ?? [])
    setState((data.matches ?? []).length ? 'ok' : 'empty')
    return (data.matches ?? []).length
  }

  // Pull NEW people from Crustdata for this ICP and show them at once (unscored), then
  // score just those in a second call while the recruiter is already reading the list.
  async function findNew() {
    setFinding(true)
    const res = await fetch(`/api/jobs/${jobId}/source/crustdata`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ score: false }) })
    setFinding(false)
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      if (res.status === 409 || j.code === 'source_disabled') {
        toast('Finding new people isn’t switched on for your workspace yet.')
        return
      }
      toast.error(j.error ?? 'Could not find new people')
      return
    }
    const { data } = await res.json()
    const s = data.sourced
    setPlan(s?.plan ?? null)
    setNewIds(new Set<string>(s?.profileIds ?? []))
    setIcp(data.icp ?? null)
    const lanes = s?.plan?.results?.length ?? 0
    toast.success(`${s?.fetched ?? 0} new people found across ${lanes} level${lanes === 1 ? '' : 's'} · ${(s?.creditsUsed ?? 0).toFixed(2)} credits used`)

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
      toast.error('Found the people, but scoring them failed — click Rank candidates to try again.')
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
    if (res.ok) { toast.success('Market access trial started — rank again to include the market.'); setState('idle') }
    else toast.error('Could not start the trial')
  }

  /** Unlock the chosen market people (spends unlocks) and add them to the pipeline. */
  async function unlockAndAdd(profileIds: string[]): Promise<boolean> {
    if (profileIds.length === 0) return false
    setAdding(true)
    const res = await fetch(`/api/jobs/${jobId}/source/pool/add`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profile_ids: profileIds }),
    })
    setAdding(false)
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      toast.error(j.error ?? 'Could not unlock these profiles')
      return false
    }
    const { data } = await res.json()
    if (data.quota_exceeded) toast.error('Unlock quota reached — upgrade to unlock more.')
    else {
      toast.success(`Unlocked ${data.unlocked} · added ${data.added} to the pipeline.`)
      if (data.no_contact) toast(`${data.no_contact} skipped — no contact details, so no credit spent.`)
      if (data.no_email) toast(`${data.no_email} had no email on file — reach out via LinkedIn or find their email before sequencing.`)
    }
    const done = new Set(profileIds)
    setMatches((m) => m.filter((x) => !done.has(x.profile_id)))
    return true
  }

  const lastRun: LevelRunStat[] | null = plan?.results.map((r) => ({ key: r.key, fetched: r.fetched, total: r.total, exhausted: r.exhausted, error: r.error })) ?? null

  return { state, matches, icp, stale, finding, scoring, adding, newIds, lastRun, misses, setFlag, rank, findNew, startTrial, unlockAndAdd }
}
