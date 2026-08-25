'use client'

// Application Review — Ashby-style bulk triage page (Slice A3).
//
// Lists every ACTIVE applicant sitting in the job's `application_review` zone
// ("Applied") and lets a recruiter triage many at once: select, then Advance into
// the first Active interview stage or Reject. Zones come from the Next.js
// pipeline-plan endpoint (authoritative — the Django /api/jobs/:id payload omits
// the zone column), so filtering and the advance target never depend on Django.

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, ArrowRight, X, Check, Loader2, ClipboardCheck } from 'lucide-react'
import { toast } from 'sonner'
import type { JobWithPipeline, Application, AiRecommendation } from '@/lib/types/database'
import type { StageZone } from '@/lib/pipeline/zones'
import { avatarColor, initials } from '@/lib/ui/avatar'
import { fmtRelative } from '@/lib/ui/date-utils'

// Local score pill + recommendation badge — the board's versions live inline in
// its page and aren't exported, so we mirror their thresholds/colors here.
function ScorePill({ score }: { score: number | null }) {
  if (score == null) return <span className="text-xs text-slate-400">—</span>
  const color =
    score >= 75 ? 'bg-emerald-100 text-emerald-700' :
    score >= 60 ? 'bg-amber-100 text-amber-700' :
                  'bg-red-100 text-red-700'
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${color}`}>{score}</span>
}

const REC_BADGE: Record<AiRecommendation, { label: string; cls: string }> = {
  strong_yes: { label: 'Strong yes', cls: 'bg-emerald-100 text-emerald-700' },
  yes:        { label: 'Yes',        cls: 'bg-slate-100 text-slate-700' },
  maybe:      { label: 'Maybe',      cls: 'bg-amber-100 text-amber-700' },
  no:         { label: 'No',         cls: 'bg-red-100 text-red-700' },
}

const SOURCE_LABEL: Record<string, string> = {
  manual: 'Manual', applied: 'Applied', imported: 'Imported', sourced: 'Sourced', referral: 'Referral',
}

type PlanStage = { id: string; zone: StageZone; order_index: number; name: string }

export default function ApplicationReviewPage() {
  const { id } = useParams<{ id: string }>()
  const [job, setJob] = useState<JobWithPipeline | null>(null)
  const [zoneByStage, setZoneByStage] = useState<Map<string, StageZone>>(new Map())
  const [firstActive, setFirstActive] = useState<{ id: string; name: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const [jobRes, planRes] = await Promise.all([
      fetch(`/api/jobs/${id}`, { cache: 'no-store' }),
      fetch(`/api/jobs/${id}/pipeline-plan`, { cache: 'no-store' }),
    ])
    const jobJson = await jobRes.json().catch(() => null)
    const planJson = await planRes.json().catch(() => null)
    const stages: PlanStage[] = planJson?.data?.stages ?? []
    setZoneByStage(new Map(stages.map(s => [s.id, s.zone])))
    const active = stages
      .filter(s => s.zone === 'active')
      .sort((a, b) => a.order_index - b.order_index)[0]
    setFirstActive(active ? { id: active.id, name: active.name } : null)
    setJob(jobJson?.data ?? null)
    setLoading(false)
  }, [id])

  useEffect(() => { void load() }, [load])

  // Active applicants whose current stage sits in the review zone.
  const reviewApps = useMemo<Application[]>(() => {
    if (!job) return []
    return job.applications.filter(a =>
      a.status === 'active' &&
      a.stage_id != null &&
      zoneByStage.get(a.stage_id) === 'application_review'
    )
  }, [job, zoneByStage])

  const selectedIds = useMemo(
    () => reviewApps.filter(a => selected.has(a.id)).map(a => a.id),
    [reviewApps, selected]
  )
  const allSelected = reviewApps.length > 0 && selectedIds.length === reviewApps.length

  const toggle = (appId: string) => setSelected(prev => {
    const n = new Set(prev)
    if (n.has(appId)) n.delete(appId); else n.add(appId)
    return n
  })
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(reviewApps.map(a => a.id)))

  const patchApp = (appId: string, body: Record<string, unknown>) =>
    fetch(`/api/applications/${appId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    })

  const advance = useCallback(async (ids: string[]) => {
    if (!firstActive || ids.length === 0) return
    setBusy(true)
    // Optimistic: give them the active stage so reviewApps re-filters them out.
    setJob(prev => prev ? { ...prev, applications: prev.applications.map(a =>
      ids.includes(a.id) ? { ...a, stage_id: firstActive.id } : a) } : prev)
    setSelected(new Set())
    try {
      await Promise.all(ids.map(appId => patchApp(appId, { stage_id: firstActive.id })))
      toast.success(`${ids.length} candidate${ids.length === 1 ? '' : 's'} moved to ${firstActive.name}`)
    } catch {
      toast.error('Some moves failed — reloading')
      await load()
    } finally { setBusy(false) }
  }, [firstActive, load])

  const reject = useCallback(async (ids: string[]) => {
    if (ids.length === 0) return
    setBusy(true)
    setJob(prev => prev ? { ...prev, applications: prev.applications.map(a =>
      ids.includes(a.id) ? { ...a, status: 'rejected' } : a) } : prev)
    setSelected(new Set())
    try {
      await Promise.all(ids.map(appId => patchApp(appId, { status: 'rejected' })))
      toast.success(`${ids.length} candidate${ids.length === 1 ? '' : 's'} rejected`)
    } catch {
      toast.error('Some rejections failed — reloading')
      await load()
    } finally { setBusy(false) }
  }, [load])

  return (
    <div className="mx-auto max-w-5xl px-6 py-6">
      {/* Header */}
      <Link href={`/jobs/${id}`} className="mb-4 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft className="h-4 w-4" /> Back to pipeline
      </Link>
      <div className="mb-5 flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#221b14] text-[#ebb137]">
          <ClipboardCheck className="h-5 w-5" />
        </span>
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">Application Review</h1>
          <p className="text-sm text-slate-500">
            {job?.position_title ? `${job.position_title} — ` : ''}triage inbound applicants before the interview process.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24 text-slate-400">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : reviewApps.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 py-20 text-center">
          <ClipboardCheck className="mx-auto mb-3 h-8 w-8 text-slate-300" />
          <p className="font-semibold text-slate-700">No applications to review</p>
          <p className="mt-1 text-sm text-slate-500">New applicants will appear here for triage.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                <th className="w-10 px-4 py-3">
                  <input type="checkbox" checked={allSelected} onChange={toggleAll}
                    className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                    aria-label="Select all" />
                </th>
                <th className="px-3 py-3">Candidate</th>
                <th className="px-3 py-3">Source</th>
                <th className="px-3 py-3">AI score</th>
                <th className="px-3 py-3">Fit</th>
                <th className="px-3 py-3">Waiting</th>
                <th className="px-3 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {reviewApps.map(a => {
                const c = a.candidate
                const rec = a.ai_recommendation ? REC_BADGE[a.ai_recommendation] : null
                const sel = selected.has(a.id)
                return (
                  <tr key={a.id} className={`border-b border-slate-100 last:border-0 ${sel ? 'bg-emerald-50/60' : 'hover:bg-slate-50'}`}>
                    <td className="px-4 py-3">
                      <input type="checkbox" checked={sel} onChange={() => toggle(a.id)}
                        className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                        aria-label={`Select ${c?.name ?? 'candidate'}`} />
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${avatarColor(c?.name ?? '?')}`}>
                          {initials(c?.name ?? '?')}
                        </div>
                        <div className="min-w-0">
                          <div className="truncate font-semibold text-slate-900">{c?.name ?? '(unknown)'}</div>
                          <div className="truncate text-xs text-slate-500">
                            {[c?.current_title, c?.current_company].filter(Boolean).join(' · ') || '—'}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <span className="text-xs text-slate-600">{SOURCE_LABEL[a.source] ?? a.source}</span>
                    </td>
                    <td className="px-3 py-3"><ScorePill score={a.ai_score} /></td>
                    <td className="px-3 py-3">
                      {rec
                        ? <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${rec.cls}`}>{rec.label}</span>
                        : <span className="text-xs text-slate-400">—</span>}
                    </td>
                    <td className="px-3 py-3 text-xs text-slate-500">{fmtRelative(a.stage_entered_at ?? a.applied_at)}</td>
                    <td className="px-3 py-3">
                      <div className="flex items-center justify-end gap-1.5">
                        <button type="button" disabled={busy || !firstActive} onClick={() => advance([a.id])}
                          title={firstActive ? `Advance to ${firstActive.name}` : 'No active stage configured'}
                          className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-40">
                          <ArrowRight className="h-3.5 w-3.5" /> Advance
                        </button>
                        <button type="button" disabled={busy} onClick={() => reject([a.id])}
                          title="Reject"
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-500 hover:bg-red-50 hover:text-red-600 disabled:opacity-40">
                          <X className="h-3.5 w-3.5" /> Reject
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Sticky bulk action bar */}
      {selectedIds.length > 0 && (
        <div className="pointer-events-none fixed inset-x-0 bottom-6 z-30 flex justify-center px-6">
          <div className="pointer-events-auto flex items-center gap-3 rounded-2xl border border-[#3a2f22] bg-[#221b14] px-4 py-2.5 text-white shadow-xl">
            <button type="button" onClick={() => setSelected(new Set())} className="text-[#c9bda9] hover:text-white" aria-label="Clear selection">
              <X className="h-4 w-4" />
            </button>
            <span className="text-sm font-semibold">{selectedIds.length} selected</span>
            <div className="mx-1 h-5 w-px bg-[#3a2f22]" />
            <button type="button" disabled={busy || !firstActive} onClick={() => advance(selectedIds)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#ebb137] px-3 py-1.5 text-sm font-semibold text-[#221b14] hover:brightness-105 disabled:opacity-40">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Advance to {firstActive?.name ?? 'Active'}
            </button>
            <button type="button" disabled={busy} onClick={() => reject(selectedIds)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#3a2f22] px-3 py-1.5 text-sm font-semibold text-[#f4ede2] hover:bg-[#2c2419] disabled:opacity-40">
              <X className="h-4 w-4" /> Reject
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
