'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Beaker, ChevronRight, RotateCcw, ThumbsDown, ThumbsUp } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import type { ExperimentCandidate, ExperimentDecision, ExperimentVariant, SourcingExperiment } from '@/lib/types/sourcing-experiment'

function decisionCounts(variant: ExperimentVariant) {
  const candidates = variant.candidates ?? []
  return {
    yes: candidates.filter((candidate) => candidate.decision === 'yes').length,
    maybe: candidates.filter((candidate) => candidate.decision === 'maybe').length,
    no: candidates.filter((candidate) => candidate.decision === 'no').length,
  }
}

function planLabels(variant: ExperimentVariant): string[] {
  const plan = variant.plan as { lanes?: { label?: string }[] } | undefined
  return (plan?.lanes ?? []).map((lane) => lane.label ?? '').filter(Boolean).slice(0, 4)
}

function CandidateCard({ candidate, onDecision }: { candidate: ExperimentCandidate; onDecision: (decision: ExperimentDecision) => void }) {
  const scoreClass = candidate.fit_bucket === 'great' ? 'text-emerald-700 bg-emerald-50' : candidate.fit_bucket === 'good' ? 'text-sky-700 bg-sky-50' : candidate.fit_bucket === 'okay' ? 'text-amber-700 bg-amber-50' : 'text-rose-700 bg-rose-50'
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="flex items-start gap-2">
        <span className={`rounded px-1.5 py-0.5 text-xs font-bold ${scoreClass}`}>{candidate.score}</span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-slate-800">{candidate.name ?? 'Unknown candidate'}</p>
          <p className="truncate text-xs text-slate-500">{[candidate.current_title, candidate.current_company].filter(Boolean).join(' · ') || 'Profile details unavailable'}</p>
          {candidate.location && <p className="mt-0.5 text-[11px] text-slate-400">{candidate.location}</p>}
        </div>
        <div className="flex shrink-0 gap-1">
          <button type="button" title="Promising" onClick={() => onDecision(candidate.decision === 'yes' ? null : 'yes')} className={`rounded p-1 ${candidate.decision === 'yes' ? 'bg-emerald-100 text-emerald-700' : 'text-slate-300 hover:bg-emerald-50 hover:text-emerald-600'}`}><ThumbsUp className="h-3.5 w-3.5" /></button>
          <button type="button" title="Not a fit" onClick={() => onDecision(candidate.decision === 'no' ? null : 'no')} className={`rounded p-1 ${candidate.decision === 'no' ? 'bg-rose-100 text-rose-700' : 'text-slate-300 hover:bg-rose-50 hover:text-rose-600'}`}><ThumbsDown className="h-3.5 w-3.5" /></button>
        </div>
      </div>
      {candidate.level_label && <p className="mt-2 text-[10px] font-medium text-indigo-600">Found through: {candidate.level_label}</p>}
      <p className="mt-1 text-xs leading-relaxed text-slate-600">{candidate.rationale}</p>
      {candidate.gate_unknown.length > 0 && <p className="mt-2 text-[11px] text-amber-600">Verify: {candidate.gate_unknown.join(' · ')}</p>}
    </div>
  )
}

function VariantColumn({ variant, onDecision }: { variant: ExperimentVariant; onDecision: (profileId: string, decision: ExperimentDecision) => void }) {
  const counts = decisionCounts(variant)
  const lanes = planLabels(variant)
  return (
    <div className="min-w-0 rounded-xl border border-slate-200 bg-slate-50/60 p-3">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-slate-800">{variant.label}</p>
          <p className="text-[11px] text-slate-500">{variant.prompt_version === 'current' ? 'Current production prompt' : 'Outcome-and-evidence challenger'}</p>
        </div>
        <div className="text-right text-[11px] text-slate-500">
          <p>{variant.fetched ?? 0} sourced · {(variant.credits_used ?? 0).toFixed(2)} credits</p>
          <p><span className="text-emerald-700">{counts.yes} promising</span> · {counts.no} no</p>
        </div>
      </div>
      {variant.sourcing_map?.reasoning && <p className="mb-3 rounded-md bg-white p-2 text-xs leading-relaxed text-slate-600">{variant.sourcing_map.reasoning}</p>}
      {lanes.length > 0 && <div className="mb-3 flex flex-wrap gap-1">{lanes.map((lane) => <span key={lane} className="rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] text-indigo-700">{lane}</span>)}</div>}
      {variant.error ? <p className="rounded bg-rose-50 p-2 text-xs text-rose-700">{variant.error}</p> : variant.candidates.length ? <div className="space-y-2">{variant.candidates.map((candidate) => <CandidateCard key={candidate.profile_id} candidate={candidate} onDecision={(decision) => onDecision(candidate.profile_id, decision)} />)}</div> : <p className="text-xs text-slate-400">No externally sourced people returned for this arm.</p>}
    </div>
  )
}

/** Persistent, job-scoped comparison of the production sourcing strategy and a challenger. */
export function SourcingExperimentLab({ jobId }: { jobId: string }) {
  const [open, setOpen] = useState(false)
  const [experiments, setExperiments] = useState<SourcingExperiment[]>([])
  const [loading, setLoading] = useState(false)
  const [running, setRunning] = useState(false)
  const [count, setCount] = useState(5)

  const load = useCallback(async () => {
    setLoading(true)
    const response = await fetch(`/api/jobs/${jobId}/source/experiments`)
    const json = await response.json().catch(() => ({}))
    if (response.ok) setExperiments(json.data ?? [])
    setLoading(false)
  }, [jobId])

  useEffect(() => { if (open) void load() }, [open, load])

  // A comparison performs two sequential Gemini + Crustdata searches and can take a few minutes.
  // Poll independently of the initiating request so results arrive even if that request is slow.
  useEffect(() => {
    if (!open || (!running && !experiments.some((experiment) => experiment.status === 'running'))) return
    const refresh = window.setInterval(() => { void load() }, 5_000)
    return () => window.clearInterval(refresh)
  }, [open, running, experiments, load])

  async function run() {
    setRunning(true)
    window.setTimeout(() => { void load() }, 1_000)
    const response = await fetch(`/api/jobs/${jobId}/source/experiments`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ count_per_variant: count }),
    })
    const json = await response.json().catch(() => ({}))
    setRunning(false)
    if (!response.ok) { toast.error(json.error ?? 'Could not run the sourcing comparison'); return }
    setExperiments((previous) => [json.data, ...previous])
    toast.success(`Compared two external searches · ${(json.data.baseline.credits_used + json.data.challenger.credits_used).toFixed(2)} credits used`)
  }

  async function decide(experimentId: string, variant: 'baseline' | 'challenger', profileId: string, decision: ExperimentDecision) {
    const response = await fetch(`/api/jobs/${jobId}/source/experiments/${experimentId}/decision`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ variant, profile_id: profileId, decision }),
    })
    const json = await response.json().catch(() => ({}))
    if (!response.ok) { toast.error(json.error ?? 'Could not save your decision'); return }
    setExperiments((previous) => previous.map((experiment) => experiment.id === experimentId ? json.data : experiment))
  }

  return (
    <section className="border-t border-slate-100 px-6 py-4">
      <div className="flex items-center justify-between gap-3">
        <button type="button" onClick={() => setOpen((value) => !value)} className="flex items-center gap-1.5 text-sm font-semibold text-slate-700">
          <ChevronRight className={`h-4 w-4 text-slate-400 transition-transform ${open ? 'rotate-90' : ''}`} />
          <Beaker className="h-4 w-4 text-violet-600" /> Sourcing Lab <span className="text-xs font-normal text-slate-400">Compare external market strategies</span>
        </button>
        {open && <div className="flex items-center gap-2"><Link href="/sourcing-lab" className="text-xs text-slate-400 hover:text-slate-600">All experiments</Link><select value={count} onChange={(event) => setCount(Number(event.target.value))} className="h-8 rounded border border-slate-200 bg-white px-2 text-xs text-slate-600"><option value={3}>3 each</option><option value={5}>5 each</option><option value={10}>10 each</option></select><Button size="sm" onClick={run} loading={running}><Beaker className="h-3.5 w-3.5" /> Compare strategies</Button></div>}
      </div>
      {open && <>
        <p className="mt-2 text-xs leading-relaxed text-slate-500">Runs the current production strategy and the challenger from the same job details, with the same Crustdata budget per arm. It does not change the approved ICP or normal sourcing results.</p>
        {loading && experiments.length === 0 ? <p className="mt-3 text-xs text-slate-400">Loading comparisons…</p> : experiments.length === 0 ? <p className="mt-3 rounded-lg border border-dashed border-slate-200 p-3 text-xs text-slate-400">No comparisons yet. Start with five external profiles per strategy.</p> : <div className="mt-4 space-y-5">{experiments.map((experiment) => <div key={experiment.id} className="rounded-xl border border-slate-200 bg-white p-3"><div className="mb-3 flex items-center justify-between text-[11px] text-slate-400"><span>{new Date(experiment.created_at).toLocaleString()}</span><span>{experiment.status === 'completed' ? 'Completed' : experiment.status === 'running' ? 'Searching the external market… results refresh automatically' : experiment.status}</span></div>{experiment.status === 'failed' ? <p className="text-xs text-rose-600">{experiment.error ?? 'Comparison failed'}</p> : <div className="grid gap-3 lg:grid-cols-2"><VariantColumn variant={experiment.baseline} onDecision={(profileId, decision) => decide(experiment.id, 'baseline', profileId, decision)} /><VariantColumn variant={experiment.challenger} onDecision={(profileId, decision) => decide(experiment.id, 'challenger', profileId, decision)} /></div>}</div>)}</div>}
        {!loading && experiments.length > 0 && <button type="button" onClick={load} className="mt-3 inline-flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600"><RotateCcw className="h-3 w-3" /> Refresh experiments</button>}
      </>}
    </section>
  )
}
