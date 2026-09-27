'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Radar, UserPlus, RefreshCw, Sparkles, Send, MailCheck, Check, X, Lock, Loader2, Globe, FlaskConical } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { pickCalibrationSet } from '@/lib/ai/calibration'
import { PersonaTabs } from '@/components/req-jobs/PersonaTabs'
import { usePoolSourcing, toMatrixMatch } from '@/components/req-jobs/usePoolSourcing'
import { SearchSpecEditor } from '@/components/req-jobs/SearchSpecEditor'
import { SourcingExperimentLab } from '@/components/req-jobs/SourcingExperimentLab'
import { CopyShortlistButton } from '@/components/req-jobs/ShortlistBrief'
import { LearningPanel } from '@/components/req-jobs/LearningPanel'
import { SourcingMatrix, type MatrixIcp, type MatrixMatch } from '@/components/req-jobs/SourcingMatrix'
import { CalibrationPopup } from '@/components/req-jobs/CalibrationPopup'
import { PoolProfilePanel } from '@/components/req-jobs/PoolProfilePanel'

const MIN_DECISIONS = 5
/** "Find new people" fetches ~10 people per run at ~0.03 credit each (source/crustdata). */
const FIND_CREDITS_ESTIMATE = '~0.3 credits'
const EXPERIMENTS_KEY = 'rs.sourcing.experiments'

interface Match {
  candidate_id: string
  score: number
  fit_bucket: string | null
  gate_failures: { label?: string }[]
  red_flags: string[]
  rationale: string | null
  competencies: { name: string; rating: number; evidence?: string }[]
  data_incomplete?: boolean | null
  icp_version: number | null
  decision: string | null
  candidate: { id: string; name: string | null; current_title: string | null; current_company: string | null; location: string | null } | null
}

interface PendingReview {
  enrollment_id: string
  sequence_name: string
  candidate_name: string
  candidate_title: string | null
  subject: string
  body: string
}

type Filter = 'all' | 'yours' | 'market'

// Your candidates and market people share one table, so row keys carry the pool.
const YOURS = 'y:'
const MARKET = 'm:'
const unkey = (k: string) => k.slice(2)

/**
 * The Source tab (One of Each, stage 3). One results table for your own candidates AND
 * the market, filtered All / Your candidates / Market, with three verbs:
 *  - Rank candidates — score everyone you already have (your ATS pool + the market pool)
 *    against the approved ICP. Free (no vendor credits).
 *  - Find new people — bring new people in from the market (spends credits).
 *  - Plan the search — the Search plan panel ("Suggest a wider plan" lives inside it).
 * 👍/👎 live in the table (your candidates); the "Review 3" pop-up only offers people not
 * yet rated. Refining the ICP happens on the Scoring tab. Sourcing Lab sits behind an
 * Experiments switch.
 */
export function SourcingTab({ jobId, onOpenScoring }: { jobId: string; onOpenScoring?: () => void }) {
  const [matches, setMatches] = useState<Match[]>([])
  const [icp, setIcp] = useState<MatrixIcp | null>(null)
  const [currentVersion, setCurrentVersion] = useState<number | null>(null)
  const [hasIcp, setHasIcp] = useState(false)
  const [loading, setLoading] = useState(true)
  const [ranking, setRanking] = useState(false)
  const [adding, setAdding] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [sequences, setSequences] = useState<{ id: string; name: string }[]>([])
  const [selectedSequence, setSelectedSequence] = useState('')
  const [enrolling, setEnrolling] = useState(false)
  const [reviewMode, setReviewMode] = useState(false)
  const [pending, setPending] = useState<PendingReview[]>([])
  const [filter, setFilter] = useState<Filter>('all')
  const [showHidden, setShowHidden] = useState(false)
  const [showOutside, setShowOutside] = useState(false)
  const [showFailed, setShowFailed] = useState(false)
  const [openProfile, setOpenProfile] = useState<string | null>(null)
  const [experiments, setExperiments] = useState(false)
  // Bumped after every rank / find so the shortlist copy is fetched fresh.
  const [resultsKey, setResultsKey] = useState(0)
  const resultsRef = useRef<HTMLDivElement>(null)
  const market = usePoolSourcing(jobId)

  const load = useCallback(async () => {
    const res = await fetch(`/api/jobs/${jobId}/source`)
    if (res.ok) {
      const { data } = await res.json()
      setMatches(data.matches ?? [])
      setIcp(data.icp ?? null)
      setCurrentVersion(data.current_icp_version ?? null)
      setHasIcp(!!data.has_approved_icp)
    }
    setLoading(false)
  }, [jobId])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    try { setExperiments(localStorage.getItem(EXPERIMENTS_KEY) === '1') } catch { /* storage unavailable */ }
  }, [])
  function toggleExperiments() {
    const next = !experiments
    setExperiments(next)
    try { localStorage.setItem(EXPERIMENTS_KEY, next ? '1' : '0') } catch { /* storage unavailable */ }
  }

  useEffect(() => {
    fetch('/api/sequences')
      .then((r) => (r.ok ? r.json() : { data: [] }))
      .then((j) =>
        setSequences(
          (j.data ?? [])
            .filter((s: { status?: string }) => s.status === 'active')
            .map((s: { id: string; name: string }) => ({ id: s.id, name: s.name })),
        ),
      )
      .catch(() => {})
  }, [])

  const loadPending = useCallback(() => {
    fetch(`/api/jobs/${jobId}/source/pending-review`)
      .then((r) => (r.ok ? r.json() : { data: { pending: [] } }))
      .then((j) => setPending(j.data?.pending ?? []))
      .catch(() => {})
  }, [jobId])
  useEffect(() => { loadPending() }, [loadPending])

  /** Make sure your candidates are embedded so ranking can match on meaning. Org-wide,
   *  batched; a no-op once done. (This was the "Embed pool" button.) */
  async function embedQuietly() {
    for (let i = 0; i < 20; i++) {
      const res = await fetch('/api/candidates/embed', { method: 'POST' }).catch(() => null)
      if (!res?.ok) return
      const { data } = await res.json()
      if (data.embedded === 0 || data.remaining === 0) return
    }
  }

  async function rankYours(): Promise<number | null> {
    const res = await fetch(`/api/jobs/${jobId}/source`, { method: 'POST' })
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      toast.error(j.error ?? 'Could not rank your candidates')
      return null
    }
    const { data } = await res.json()
    setMatches(data.matches ?? [])
    setCurrentVersion(data.icp_version ?? currentVersion)
    return data.scored ?? (data.matches ?? []).length
  }

  /** Rank candidates: score everyone we already have — your pool and the market pool. */
  async function rankAll() {
    setRanking(true)
    try {
      await embedQuietly()
      const [yours, mkt] = await Promise.all([rankYours(), market.rank()])
      const parts = [yours != null ? `${yours} of your candidates` : null, mkt != null ? `${mkt} from the market` : null].filter(Boolean)
      if (parts.length) toast.success(`Ranked ${parts.join(' and ')}.`)
      setResultsKey((k) => k + 1)
    } finally {
      setRanking(false)
    }
  }

  async function findNew() {
    await market.findNew()
    setResultsKey((k) => k + 1)
  }

  const selectedYours = Array.from(selected).filter((k) => k.startsWith(YOURS)).map(unkey)
  const selectedMarket = Array.from(selected).filter((k) => k.startsWith(MARKET)).map(unkey)

  async function addSelected() {
    if (selectedYours.length === 0) return
    setAdding(true)
    const res = await fetch(`/api/jobs/${jobId}/source/add`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ candidate_ids: selectedYours }),
    })
    setAdding(false)
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      toast.error(j.error ?? 'Could not add to pipeline')
      return
    }
    const { data } = await res.json()
    toast.success(`Added ${data.added} to the pipeline${data.skipped ? `, ${data.skipped} already there` : ''}.`)
    setSelected((prev) => new Set(Array.from(prev).filter((k) => !k.startsWith(YOURS))))
    load()
  }

  async function unlockSelected() {
    if (await market.unlockAndAdd(selectedMarket)) {
      setSelected((prev) => new Set(Array.from(prev).filter((k) => !k.startsWith(MARKET))))
    }
  }

  async function enrollSelected() {
    if (selectedYours.length === 0 || !selectedSequence) return
    setEnrolling(true)
    const res = await fetch(`/api/jobs/${jobId}/source/enroll`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ candidate_ids: selectedYours, sequence_id: selectedSequence, review: reviewMode }),
    })
    setEnrolling(false)
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      toast.error(j.error ?? 'Could not enroll into the sequence')
      return
    }
    const { data } = await res.json()
    toast.success(
      data.held
        ? `${data.enrolled} queued for review before sending${data.skipped ? `, ${data.skipped} skipped` : ''}.`
        : `Enrolled ${data.enrolled} into the sequence${data.skipped ? `, ${data.skipped} skipped` : ''}.`,
    )
    setSelected((prev) => new Set(Array.from(prev).filter((k) => !k.startsWith(YOURS))))
    setSelectedSequence('')
    if (data.held) loadPending()
  }

  async function reviewEnrollment(enrollmentId: string, action: 'approve' | 'reject') {
    // Optimistically drop it from the list; restore on failure.
    const prev = pending
    setPending((p) => p.filter((x) => x.enrollment_id !== enrollmentId))
    const res = await fetch(`/api/sequences/enrollments/${enrollmentId}/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    })
    if (!res.ok) {
      setPending(prev)
      const j = await res.json().catch(() => ({}))
      toast.error(j.error ?? 'Could not update this message')
      return
    }
    toast.success(action === 'approve' ? 'Approved — the first message will send.' : 'Rejected — nothing was sent.')
  }

  async function decide(candidateId: string, decision: 'yes' | 'no') {
    // Toggle off if the same decision is clicked again.
    const current = matches.find((m) => m.candidate_id === candidateId)?.decision
    const next = current === decision ? null : decision
    setMatches((prev) => prev.map((m) => (m.candidate_id === candidateId ? { ...m, decision: next } : m)))
    const res = await fetch(`/api/jobs/${jobId}/source/decide`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ candidate_id: candidateId, decision: next }),
    })
    if (!res.ok) {
      // revert on failure
      setMatches((prev) => prev.map((m) => (m.candidate_id === candidateId ? { ...m, decision: current ?? null } : m)))
      toast.error('Could not save your decision')
    }
  }

  const toggle = (key: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  const decidedCount = matches.filter((m) => m.decision === 'yes' || m.decision === 'no' || m.decision === 'maybe').length

  // The "Review 3" trio — a diverse spread across the score range, from people NOT yet
  // rated, so the pop-up never duplicates a thumb already given in the table.
  const calibProfiles = pickCalibrationSet(matches.filter((m) => !m.decision), 3).map((m) => ({
    candidate_id: m.candidate_id,
    name: m.candidate?.name ?? 'Unknown',
    title: m.candidate?.current_title ?? null,
    company: m.candidate?.current_company ?? null,
    decision: m.decision,
  }))

  // ── the one results table ─────────────────────────────────────────────────
  // "Ask the candidate" rows can't be checked from a profile, so they're not columns.
  const baseIcp = icp ?? market.icp
  const tableIcp: MatrixIcp | null = baseIcp ? { ...baseIcp, must_haves: baseIcp.must_haves.filter((g) => g.attribute !== 'screening') } : null
  const yoursRows: MatrixMatch[] = matches.map((m) => ({ ...m, row_kind: 'yours' as const, candidate_id: YOURS + m.candidate_id }))
  const marketVisible = market.matches.filter((m) => (showHidden || !m.hidden) && (showOutside || !m.outside_plan) && (showFailed || market.misses(m) === 0))
  const marketRows: MatrixMatch[] = marketVisible.map((m) => { const r = toMatrixMatch(m, market.newIds); return { ...r, candidate_id: MARKET + r.candidate_id } })
  const rows = filter === 'yours' ? yoursRows : filter === 'market' ? marketRows
    : [...yoursRows, ...marketRows].sort((a, b) => Number(!!b.pending) - Number(!!a.pending) || b.score - a.score)

  // Market people folded away by default (hidden, outside the plan, missing a must-have).
  const mHidden = market.matches.filter((m) => m.hidden).length
  const mOutside = market.matches.filter((m) => !m.hidden && m.outside_plan).length
  const mFailed = market.matches.filter((m) => !m.hidden && !m.outside_plan && market.misses(m) > 0).length

  const yoursStale = matches.some((m) => currentVersion != null && m.icp_version !== currentVersion)
  const stale = yoursStale || (market.state === 'ok' && market.stale)

  if (loading) {
    return (
      <div className="space-y-4">
        <PersonaTabs jobId={jobId} onOpenScoring={onOpenScoring} />
        <Card><CardContent className="py-8 text-center text-sm text-slate-400">Loading…</CardContent></Card>
      </div>
    )
  }

  const FilterButton = ({ value, label, count }: { value: Filter; label: string; count: number }) => (
    <button type="button" onClick={() => setFilter(value)} aria-pressed={filter === value}
      className={`px-2.5 py-1 text-xs font-medium ${filter === value ? 'bg-emerald-50 text-emerald-700' : 'text-slate-500 hover:bg-slate-50'}`}>
      {label} <span className="tabular-nums text-slate-400">{count}</span>
    </button>
  )

  return (
    <div className="space-y-4">
    <PersonaTabs jobId={jobId} onOpenScoring={onOpenScoring} />
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-sm">
              <Radar className="h-4 w-4 text-slate-500" /> Candidates for this role
            </CardTitle>
            <CardDescription>
              <b className="font-medium text-slate-600">Rank candidates</b> scores everyone you already have (free).{' '}
              <b className="font-medium text-slate-600">Find new people</b> brings new people in from the market (uses credits).
            </CardDescription>
          </div>
          {hasIcp && (
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Button size="sm" variant="outline" onClick={findNew} loading={market.finding}
                title={`Search the market with the plan below, level 1 first, and add new people to this list. Uses about ${FIND_CREDITS_ESTIMATE} per run.`}>
                <Globe className="h-3.5 w-3.5" /> Find new people <span className="font-normal text-slate-400">· {FIND_CREDITS_ESTIMATE}</span>
              </Button>
              <Button size="sm" onClick={rankAll} loading={ranking}
                title="Score your own candidates and the market pool against the approved ICP. No credits.">
                <Sparkles className="h-3.5 w-3.5" /> Rank candidates
              </Button>
            </div>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {!hasIcp ? (
          <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center">
            <p className="text-sm text-slate-500">Approve an ICP for this job to source against it.</p>
            <p className="mt-1 text-xs text-slate-400">Sourcing uses the ICP&apos;s must-haves as filters and its competencies to rank.</p>
          </div>
        ) : (
          <>
            {/* Plan the search — who "Find new people" looks for, and in what order. */}
            {market.state !== 'no_access' && (
              <SearchSpecEditor jobId={jobId} onOpenScoring={onOpenScoring} lastRun={market.lastRun} />
            )}
            {market.state === 'no_access' && (
              <div className="rounded-lg border border-dashed border-slate-300 p-4 text-center">
                <p className="text-xs text-slate-500">Rank people beyond your own candidates — the cross-org Candidate Pool, scored against this job’s ICP.</p>
                <Button size="sm" className="mt-2" onClick={market.startTrial}><Lock className="h-3.5 w-3.5" /> Start a free trial (25 unlocks)</Button>
              </div>
            )}

            <div ref={resultsRef} className="flex flex-wrap items-center gap-2">
              <div className="inline-flex overflow-hidden rounded-lg border border-slate-200" role="group" aria-label="Show">
                <FilterButton value="all" label="All" count={yoursRows.length + marketRows.length} />
                <FilterButton value="yours" label="Your candidates" count={yoursRows.length} />
                <FilterButton value="market" label="Market" count={marketRows.length} />
              </div>
              {filter !== 'yours' && (mFailed > 0 || mOutside > 0 || mHidden > 0) && (
                <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-400">
                  {mFailed > 0 && <button type="button" onClick={() => setShowFailed((v) => !v)} className="hover:text-slate-600" title="Market people who fail at least one must-have">{showFailed ? 'Hide' : 'Show'} {mFailed} who miss a must-have</button>}
                  {mOutside > 0 && <button type="button" onClick={() => setShowOutside((v) => !v)} className="hover:text-slate-600" title="Already in the pool but outside the plan's location or years">{showOutside ? 'Hide' : 'Show'} {mOutside} outside the plan</button>}
                  {mHidden > 0 && <button type="button" onClick={() => setShowHidden((v) => !v)} className="hover:text-slate-600">{showHidden ? 'Hide' : 'Show'} {mHidden} hidden</button>}
                </div>
              )}
              <span className="ml-auto flex items-center gap-2">
                <Link href="/pool/usage" className="text-[11px] text-slate-400 hover:text-slate-600">Unlock usage</Link>
                <CopyShortlistButton jobId={jobId} refreshKey={resultsKey} />
              </span>
            </div>

            {decidedCount > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 text-[11px] text-slate-600">
                <span>{decidedCount} decision{decidedCount === 1 ? '' : 's'} on your candidates</span>
                {/* Refining lives on the Scoring tab (it produces a draft you approve there). */}
                {decidedCount < MIN_DECISIONS ? (
                  <span className="text-slate-400">{decidedCount} of {MIN_DECISIONS} decisions needed to refine the ICP</span>
                ) : (
                  <button type="button" onClick={onOpenScoring} disabled={!onOpenScoring}
                    className="inline-flex items-center gap-1 font-semibold text-emerald-700 hover:text-emerald-900">
                    <Sparkles className="h-3 w-3" /> Enough decisions — refine the ICP on Scoring →
                  </button>
                )}
              </div>
            )}
            {stale && (
              <div className="flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2 text-[11px] text-amber-700">
                <RefreshCw className="h-3 w-3 shrink-0" />
                Some results were scored against an older ICP — Rank candidates to refresh them.
              </div>
            )}
            {market.scoring > 0 && (
              <p className="flex items-center gap-1.5 text-[11px] text-slate-500">
                <Loader2 className="h-3 w-3 animate-spin" /> Scoring {market.scoring} new {market.scoring === 1 ? 'person' : 'people'} against the ICP…
              </p>
            )}

            {rows.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center">
                <p className="text-sm text-slate-500">{filter === 'market' ? 'No market people yet.' : filter === 'yours' ? 'None of your candidates ranked yet.' : 'No results yet.'}</p>
                <p className="mt-1 text-xs text-slate-400">Rank candidates to score the people you already have, or Find new people from the market.</p>
              </div>
            ) : tableIcp ? (
              <SourcingMatrix
                matches={rows}
                icp={tableIcp}
                selected={selected}
                onToggle={toggle}
                onDecide={(key, d) => decide(unkey(key), d)}
                onStar={(key, starred) => market.setFlag(unkey(key), { starred })}
                onHide={(key) => market.setFlag(unkey(key), { hidden: true })}
                onOpenProfile={(key) => setOpenProfile(unkey(key))}
              />
            ) : (
              <div className="rounded-xl border border-dashed border-slate-300 p-4 text-center text-xs text-slate-400">
                Loading the ICP&apos;s ranking parameters…
              </div>
            )}
          </>
        )}
      </CardContent>

      {selected.size > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-6 py-3">
          <span className="text-xs text-slate-500">
            {selected.size} selected
            {selectedYours.length > 0 && selectedMarket.length > 0 && ` (${selectedYours.length} yours · ${selectedMarket.length} market)`}
          </span>
          <div className="flex flex-wrap items-center gap-2">
            {selectedYours.length > 0 && sequences.length > 0 && (
              <>
                <select
                  id="source-sequence"
                  value={selectedSequence}
                  onChange={(e) => setSelectedSequence(e.target.value)}
                  className="h-8 rounded border border-slate-200 bg-white px-2 text-xs text-slate-600"
                  title="Enroll your selected candidates into a sequence with a personalized first message"
                >
                  <option value="">Add to sequence…</option>
                  {sequences.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
                <label className="flex items-center gap-1 text-xs text-slate-500" title="Hold each first message for you to read and approve before it sends">
                  <input type="checkbox" checked={reviewMode} onChange={(e) => setReviewMode(e.target.checked)} className="h-3.5 w-3.5" />
                  Review before sending
                </label>
                <Button size="sm" variant="outline" onClick={enrollSelected} loading={enrolling} disabled={!selectedSequence}>
                  <Send className="h-3.5 w-3.5" /> Enroll
                </Button>
              </>
            )}
            {selectedYours.length > 0 && (
              <Button size="sm" onClick={addSelected} loading={adding}>
                <UserPlus className="h-3.5 w-3.5" /> Add {selectedYours.length} to pipeline
              </Button>
            )}
            {selectedMarket.length > 0 && (
              <Button size="sm" onClick={unlockSelected} loading={market.adding} title="Uses one unlock per person with contact details">
                <Lock className="h-3.5 w-3.5" /> Unlock &amp; add {selectedMarket.length}
              </Button>
            )}
          </div>
        </div>
      )}

      {pending.length > 0 && (
        <div className="border-t border-slate-100 px-6 py-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-slate-700">
            <MailCheck className="h-4 w-4 text-sky-600" />
            Awaiting your review ({pending.length})
          </div>
          <p className="mb-3 text-xs text-slate-500">
            These first messages are held and will not send until you approve them.
          </p>
          <div className="space-y-2">
            {pending.map((p) => (
              <div key={p.enrollment_id} className="rounded-lg border border-slate-200 bg-slate-50/60 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-slate-800">
                      {p.candidate_name}
                      {p.candidate_title && <span className="font-normal text-slate-400"> · {p.candidate_title}</span>}
                    </div>
                    <div className="text-[11px] text-slate-400">into {p.sequence_name}</div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button type="button" onClick={() => reviewEnrollment(p.enrollment_id, 'approve')} title="Approve and send"
                      className="flex items-center gap-1 rounded bg-emerald-600 px-2 py-1 text-xs font-medium text-white hover:bg-emerald-700">
                      <Check className="h-3.5 w-3.5" /> Approve
                    </button>
                    <button type="button" onClick={() => reviewEnrollment(p.enrollment_id, 'reject')} title="Reject — do not send"
                      className="flex items-center gap-1 rounded border border-slate-200 px-2 py-1 text-xs text-slate-500 hover:bg-white hover:text-red-600">
                      <X className="h-3.5 w-3.5" /> Reject
                    </button>
                  </div>
                </div>
                <div className="mt-2 rounded border border-slate-200 bg-white p-2">
                  <div className="text-xs font-medium text-slate-700">{p.subject || '(no subject)'}</div>
                  <div className="mt-1 line-clamp-4 whitespace-pre-wrap text-xs text-slate-500"
                    dangerouslySetInnerHTML={{ __html: p.body || '<span class="italic">(empty)</span>' }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Sourcing Brain — the learning loop (Slice 3) ─────────────────────── */}
      <LearningPanel jobId={jobId} onOpenScoring={onOpenScoring} />

      {/* ── Experiments: Sourcing Lab (A/B two strategies; spends credits) ───── */}
      <div className="border-t border-slate-100 px-6 py-3">
        <label className="flex w-fit cursor-pointer items-center gap-2 text-xs text-slate-500">
          <input id="source-experiments" type="checkbox" checked={experiments} onChange={toggleExperiments} className="h-3.5 w-3.5" />
          <FlaskConical className="h-3.5 w-3.5 text-slate-400" /> Show experiments (Sourcing Lab — compares two search strategies; uses credits)
        </label>
      </div>
      {experiments && <SourcingExperimentLab jobId={jobId} />}
    </Card>

    {hasIcp && calibProfiles.length > 0 && (
      <CalibrationPopup
        profiles={calibProfiles}
        onDecide={(id, d) => decide(id, d)}
        onReviewAll={() => { setFilter('yours'); resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }}
      />
    )}
    {openProfile && (
      <PoolProfilePanel profileId={openProfile} tags={market.matches.find((m) => m.profile_id === openProfile)?.tags} onClose={() => setOpenProfile(null)} />
    )}
    </div>
  )
}
