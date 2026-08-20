'use client'

import { useCallback, useEffect, useState } from 'react'
import { Radar, ShieldAlert, UserPlus, MapPin, RefreshCw, ThumbsUp, ThumbsDown, Sparkles, Wand2, Send, MailCheck, Check, X, ChevronRight, FileQuestion } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { pickCalibrationSet } from '@/lib/ai/calibration'
import { fitBucketFor } from '@/lib/ai/fit-bucket'
import { PoolSourcingSection } from '@/components/req-jobs/PoolSourcingSection'
import { ShortlistBrief } from '@/components/req-jobs/ShortlistBrief'
import { LearningPanel } from '@/components/req-jobs/LearningPanel'

const CALIBRATION_SIZE = 15
const MIN_DECISIONS = 5

const BUCKET: Record<string, { label: string; cls: string }> = {
  great: { label: 'Great fit', cls: 'bg-emerald-100 text-emerald-700' },
  good: { label: 'Good fit', cls: 'bg-sky-100 text-sky-700' },
  okay: { label: 'Okay fit', cls: 'bg-amber-100 text-amber-700' },
  weak: { label: 'Weak fit', cls: 'bg-rose-100 text-rose-700' },
}

interface Match {
  candidate_id: string
  score: number
  fit_bucket: string | null
  gate_failures: { label?: string }[]
  red_flags: string[]
  rationale: string | null
  data_incomplete?: boolean | null
  icp_version: number | null
  decision: string | null
  candidate: { id: string; name: string | null; current_title: string | null; location: string | null } | null
}

interface PendingReview {
  enrollment_id: string
  sequence_name: string
  candidate_name: string
  candidate_title: string | null
  subject: string
  body: string
}

/**
 * Sourcing (Component 05, 5a). Ranks the org's candidate pool against the job's
 * approved ICP with the Fit Engine, shows the matches, and adds the good ones to
 * the pipeline. Runs on demand ("Source candidates") and caches the result.
 */
export function SourcingTab({ jobId }: { jobId: string }) {
  const [matches, setMatches] = useState<Match[]>([])
  const [openInternal, setOpenInternal] = useState(true) // the primary section — open by default
  const [currentVersion, setCurrentVersion] = useState<number | null>(null)
  const [hasIcp, setHasIcp] = useState(false)
  const [loading, setLoading] = useState(true)
  const [sourcing, setSourcing] = useState(false)
  const [adding, setAdding] = useState(false)
  const [refining, setRefining] = useState(false)
  const [embedding, setEmbedding] = useState(false)
  const [calibrate, setCalibrate] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [sequences, setSequences] = useState<{ id: string; name: string }[]>([])
  const [selectedSequence, setSelectedSequence] = useState('')
  const [enrolling, setEnrolling] = useState(false)
  const [reviewMode, setReviewMode] = useState(false)
  const [pending, setPending] = useState<PendingReview[]>([])

  const load = useCallback(async () => {
    const res = await fetch(`/api/jobs/${jobId}/source`)
    if (res.ok) {
      const { data } = await res.json()
      setMatches(data.matches ?? [])
      setCurrentVersion(data.current_icp_version ?? null)
      setHasIcp(!!data.has_approved_icp)
    }
    setLoading(false)
  }, [jobId])

  useEffect(() => { load() }, [load])

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

  async function runSource() {
    setSourcing(true)
    const res = await fetch(`/api/jobs/${jobId}/source`, { method: 'POST' })
    setSourcing(false)
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      toast.error(j.error ?? 'Sourcing failed')
      return
    }
    const { data } = await res.json()
    setMatches(data.matches ?? [])
    setCurrentVersion(data.icp_version ?? currentVersion)
    toast.success(`Sourced ${data.scored} candidate${data.scored === 1 ? '' : 's'} from your pool.`)
  }

  async function addSelected() {
    if (selected.size === 0) return
    setAdding(true)
    const res = await fetch(`/api/jobs/${jobId}/source/add`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ candidate_ids: Array.from(selected) }),
    })
    setAdding(false)
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      toast.error(j.error ?? 'Could not add to pipeline')
      return
    }
    const { data } = await res.json()
    toast.success(`Added ${data.added} to the pipeline${data.skipped ? `, ${data.skipped} already there` : ''}.`)
    setSelected(new Set())
    load()
  }

  async function enrollSelected() {
    if (selected.size === 0 || !selectedSequence) return
    setEnrolling(true)
    const res = await fetch(`/api/jobs/${jobId}/source/enroll`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ candidate_ids: Array.from(selected), sequence_id: selectedSequence, review: reviewMode }),
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
    setSelected(new Set())
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

  // Backfill embeddings so sourcing can use semantic recall (5c). Org-wide, batched.
  async function embedPool() {
    setEmbedding(true)
    let total = 0
    try {
      for (;;) {
        const res = await fetch('/api/candidates/embed', { method: 'POST' })
        if (!res.ok) { toast.error('Embedding failed'); break }
        const { data } = await res.json()
        total += data.embedded
        if (data.embedded === 0 || data.remaining === 0) {
          toast.success(total > 0 ? `Embedded ${total} candidate${total === 1 ? '' : 's'} — semantic sourcing is ready.` : 'Your pool is already embedded.')
          break
        }
      }
    } finally {
      setEmbedding(false)
    }
  }

  async function refineFromFeedback() {
    setRefining(true)
    const res = await fetch(`/api/jobs/${jobId}/icp/refine-from-feedback`, { method: 'POST' })
    setRefining(false)
    const body = await res.json().catch(() => ({}))
    if (!res.ok) {
      toast.error(body.error ?? 'Could not refine the ICP')
      return
    }
    const data = body.data
    if (data?.status === 'insufficient') {
      toast(`${data.decided}/${data.needed} decisions so far — mark a few more, then refine.`)
      return
    }
    toast.success(`ICP refined from your decisions — review draft v${data?.icp?.version ?? ''} on the Scoring tab.`)
  }

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const decidedCount = matches.filter((m) => m.decision === 'yes' || m.decision === 'no' || m.decision === 'maybe').length
  const shown = calibrate ? pickCalibrationSet(matches, CALIBRATION_SIZE) : matches

  const stale = matches.some((m) => currentVersion != null && m.icp_version !== currentVersion)

  if (loading) {
    return <Card><CardContent className="py-8 text-center text-sm text-slate-400">Loading…</CardContent></Card>
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <button type="button" onClick={() => setOpenInternal((v) => !v)} className="flex items-center gap-1.5 text-left">
              <ChevronRight className={`h-4 w-4 text-slate-400 transition-transform ${openInternal ? 'rotate-90' : ''}`} />
              <CardTitle className="flex items-center gap-2 text-sm">
                <Radar className="h-4 w-4 text-slate-500" /> From your candidates
                {matches.length > 0 && <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">{matches.length}</span>}
              </CardTitle>
            </button>
            <CardDescription className="pl-[1.375rem]">
              Rank your existing candidate pool against this job&apos;s approved ICP, then add the best to the pipeline.
            </CardDescription>
          </div>
          {hasIcp && (
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Button size="sm" variant="outline" onClick={embedPool} loading={embedding}
                title="Embed your candidate pool once so sourcing can match semantically">
                <Wand2 className="h-3.5 w-3.5" /> Embed pool
              </Button>
              {matches.length > 0 && (
                <Button size="sm" variant={calibrate ? 'primary' : 'outline'} onClick={() => setCalibrate((v) => !v)}
                  title="Show a diverse ~15 to calibrate the ICP faster">
                  {calibrate ? 'Calibration set' : 'Calibrate'}
                </Button>
              )}
              <Button size="sm" onClick={runSource} loading={sourcing}>
                <Radar className="h-3.5 w-3.5" /> {matches.length ? 'Re-source' : 'Source candidates'}
              </Button>
            </div>
          )}
        </div>
      </CardHeader>

      {openInternal && (<>
      <CardContent className="space-y-3">
        {!hasIcp ? (
          <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center">
            <p className="text-sm text-slate-500">Approve an ICP for this job to source against it.</p>
            <p className="mt-1 text-xs text-slate-400">Sourcing uses the ICP&apos;s must-haves as filters and its competencies to rank.</p>
          </div>
        ) : matches.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center">
            <p className="text-sm text-slate-500">No matches yet.</p>
            <p className="mt-1 text-xs text-slate-400">Run sourcing to find candidates from your pool who fit this role.</p>
          </div>
        ) : (
          <>
            {(calibrate || decidedCount > 0) && (
              <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-[11px] text-slate-600">
                <span>
                  {decidedCount} decision{decidedCount === 1 ? '' : 's'}
                  {calibrate ? ` · reviewing ${shown.length} diverse candidates` : ''}
                </span>
                <Button size="sm" variant="outline" onClick={refineFromFeedback} loading={refining} disabled={decidedCount < MIN_DECISIONS}>
                  <Sparkles className="h-3 w-3" /> Refine ICP{decidedCount < MIN_DECISIONS ? ` (${decidedCount}/${MIN_DECISIONS})` : ''}
                </Button>
              </div>
            )}
            {stale && (
              <div className="flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2 text-[11px] text-amber-700">
                <RefreshCw className="h-3 w-3 shrink-0" />
                Some matches were scored against an older ICP — re-source to refresh.
              </div>
            )}
            <div className="overflow-hidden rounded-xl border border-slate-200 divide-y divide-slate-100">
              {shown.map((m) => {
                // Derive the band from the score so a stale stored label can't misread a low score.
                const b = BUCKET[fitBucketFor(m.score, m.gate_failures.length === 0)]
                const gated = m.gate_failures.length > 0
                return (
                  <div key={m.candidate_id} className="flex items-start gap-3 px-3 py-2.5 hover:bg-slate-50">
                    <input
                      type="checkbox"
                      checked={selected.has(m.candidate_id)}
                      onChange={() => toggle(m.candidate_id)}
                      className="mt-1 h-3.5 w-3.5 shrink-0 accent-slate-700"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="text-sm font-medium text-slate-800">{m.candidate?.name ?? 'Unknown'}</span>
                        <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-600">{m.score}/100</span>
                        {b && <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${b.cls}`}>{b.label}</span>}
                        {gated && (
                          <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-700">
                            <ShieldAlert className="mr-0.5 inline h-2.5 w-2.5" />Missing must-have
                          </span>
                        )}
                        {m.data_incomplete && (
                          <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700"
                            title="No education or work history on file — we can't verify this candidate's background (e.g. whether they're an engineer). Enrich their profile to confirm.">
                            <FileQuestion className="mr-0.5 inline h-2.5 w-2.5" />Background unverified
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-slate-500">
                        {m.candidate?.current_title && <span>{m.candidate.current_title}</span>}
                        {m.candidate?.location && (
                          <span className="inline-flex items-center gap-0.5"><MapPin className="h-2.5 w-2.5" />{m.candidate.location}</span>
                        )}
                      </div>
                      {m.rationale && <p className="mt-1 text-[11px] leading-relaxed text-slate-500">{m.rationale}</p>}
                    </div>
                    <div className="flex shrink-0 items-center gap-1 pt-0.5">
                      <button type="button" onClick={() => decide(m.candidate_id, 'yes')} title="Good fit"
                        className={`rounded p-1 ${m.decision === 'yes' ? 'bg-emerald-100 text-emerald-700' : 'text-slate-300 hover:bg-slate-100 hover:text-emerald-600'}`}>
                        <ThumbsUp className="h-3.5 w-3.5" />
                      </button>
                      <button type="button" onClick={() => decide(m.candidate_id, 'no')} title="Not a fit"
                        className={`rounded p-1 ${m.decision === 'no' ? 'bg-red-100 text-red-700' : 'text-slate-300 hover:bg-slate-100 hover:text-red-600'}`}>
                        <ThumbsDown className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </CardContent>

      {selected.size > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-6 py-3">
          <span className="text-xs text-slate-500">{selected.size} selected</span>
          <div className="flex flex-wrap items-center gap-2">
            {sequences.length > 0 && (
              <>
                <select
                  value={selectedSequence}
                  onChange={(e) => setSelectedSequence(e.target.value)}
                  className="h-8 rounded border border-slate-200 bg-white px-2 text-xs text-slate-600"
                  title="Enroll into a sequence with a personalized first message"
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
            <Button size="sm" onClick={addSelected} loading={adding}>
              <UserPlus className="h-3.5 w-3.5" /> Add to pipeline
            </Button>
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
      </>)}

      {/* ── Sourcing Brain — the market (Pool B) ─────────────────────────────── */}
      <PoolSourcingSection jobId={jobId} />

      {/* ── Sourcing Brain — the shortlist brief (Slice 1b) ──────────────────── */}
      <ShortlistBrief jobId={jobId} />

      {/* ── Sourcing Brain — the learning loop (Slice 3) ─────────────────────── */}
      <LearningPanel jobId={jobId} />
    </Card>
  )
}
