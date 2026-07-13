'use client'

import { useEffect, useState, useCallback } from 'react'
import { Loader2, Users } from 'lucide-react'
import { MultiSelect, type Opt } from './MultiSelect'

export interface PreviewCandidate { id: string; name: string; email: string }

const STATUS_OPTIONS: Opt[] = [
  { value: 'active', label: 'Active' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'withdrawn', label: 'Withdrawn' },
  { value: 'hired', label: 'Hired' },
]

export default function BulkEnrollPanel({ sequenceId, active, onPreviewChange, onEnrolled }: {
  sequenceId: string
  active: boolean
  onPreviewChange: (matched: number | null, candidates: PreviewCandidate[]) => void
  onEnrolled: () => void
}) {
  const [departments, setDepartments] = useState<Opt[]>([])
  const [jobs, setJobs] = useState<Opt[]>([])
  const [stageOpts, setStageOpts] = useState<Opt[]>([])
  const [tagOpts, setTagOpts] = useState<Opt[]>([])

  const [deptIds, setDeptIds] = useState<string[]>([])
  const [jobIds, setJobIds] = useState<string[]>([])
  const [stageNames, setStageNames] = useState<string[]>([])
  const [tags, setTags] = useState<string[]>([])
  const [statuses, setStatuses] = useState<string[]>([])
  const [excludeDNC, setExcludeDNC] = useState(true)

  const [counting, setCounting] = useState(false)
  const [enrolling, setEnrolling] = useState(false)
  const [result, setResult] = useState<{ enrolled: number; skipped: number } | null>(null)
  const [error, setError] = useState('')
  const [matched, setMatched] = useState<number | null>(null)

  const toggle = (setter: React.Dispatch<React.SetStateAction<string[]>>) => (v: string) =>
    setter(prev => prev.includes(v) ? prev.filter(x => x !== v) : [...prev, v])

  useEffect(() => {
    (async () => {
      const [dRes, jRes, oRes] = await Promise.all([fetch('/api/departments'), fetch('/api/jobs'), fetch('/api/automations/options')])
      if (dRes.ok) setDepartments(((await dRes.json()).data ?? []).map((d: { id: string; name: string }) => ({ value: d.id, label: d.name })))
      // /api/jobs is Django-served in prod (title lives under `position_title`) and
      // Next.js-served locally (`title`) — accept whichever is present.
      if (jRes.ok) setJobs(((await jRes.json()).data ?? []).map((j: { id: string; title?: string; position_title?: string; name?: string }) => ({ value: j.id, label: j.title || j.position_title || j.name || '(untitled job)' })))
      if (oRes.ok) {
        const o = (await oRes.json()).data ?? { tags: [], stages: [] }
        setStageOpts((o.stages ?? []).map((s: string) => ({ value: s, label: s })))
        setTagOpts((o.tags ?? []).map((t: string) => ({ value: t, label: t })))
      }
    })()
  }, [])

  const filters = useCallback(() => ({
    department_ids: deptIds, job_ids: jobIds, stage_names: stageNames, tags, statuses, exclude_do_not_contact: excludeDNC,
  }), [deptIds, jobIds, stageNames, tags, statuses, excludeDNC])

  const anyFilter = deptIds.length || jobIds.length || stageNames.length || tags.length || statuses.length

  useEffect(() => {
    setResult(null)
    if (!anyFilter) { setMatched(null); onPreviewChange(null, []); return }
    setCounting(true)
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/sequences/${sequenceId}/enroll-by-filter`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filters: filters(), dryRun: true }),
        })
        const json = await res.json()
        if (res.ok) {
          setMatched(json.data?.matched ?? 0)
          onPreviewChange(json.data?.matched ?? 0, json.data?.preview ?? [])
        } else { setError(json.error ?? ''); setMatched(null); onPreviewChange(null, []) }
      } finally { setCounting(false) }
    }, 400)
    return () => clearTimeout(t)
  }, [anyFilter, filters, sequenceId, onPreviewChange])

  const enroll = async () => {
    setEnrolling(true); setError('')
    const res = await fetch(`/api/sequences/${sequenceId}/enroll-by-filter`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ filters: filters() }),
    })
    const json = await res.json()
    setEnrolling(false)
    if (!res.ok) { setError(json.error ?? 'Failed to enroll'); return }
    setResult({ enrolled: json.data.enrolled, skipped: json.data.skipped })
    onEnrolled()
  }

  return (
    <div className="space-y-3">
      {!active && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-700">
          Activate the sequence before enrolling.
        </div>
      )}
      <p className="text-[11px] text-slate-400">Candidates must match <b>all</b> the filters you set. The left panel previews who matches.</p>

      <MultiSelect label="Department" options={departments} selected={deptIds} onToggle={toggle(setDeptIds)} />
      <MultiSelect label="Jobs" options={jobs} selected={jobIds} onToggle={toggle(setJobIds)} />
      <MultiSelect label="Stages" options={stageOpts} selected={stageNames} onToggle={toggle(setStageNames)} />
      <MultiSelect label="Tags" options={tagOpts} selected={tags} onToggle={toggle(setTags)} />
      <MultiSelect label="Application status" options={STATUS_OPTIONS} selected={statuses} onToggle={toggle(setStatuses)} />

      <label className="flex items-center gap-2 text-xs text-slate-600">
        <input type="checkbox" checked={excludeDNC} onChange={e => setExcludeDNC(e.target.checked)} className="text-emerald-600 focus:ring-emerald-500" />
        Skip candidates tagged do-not-contact
      </label>

      {error && <p className="text-xs font-medium text-red-500">{error}</p>}
      {result && <p className="text-sm font-semibold text-emerald-700">Enrolled {result.enrolled} · skipped {result.skipped} (already in)</p>}

      <button
        onClick={enroll}
        disabled={enrolling || !anyFilter || !active || !matched || !!result}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#221b14] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#33271b] disabled:opacity-50"
      >
        {enrolling ? <Loader2 className="h-4 w-4 animate-spin" /> : <Users className="h-4 w-4" />}
        {counting ? 'Counting…' : `Enroll ${matched ?? 0} into this sequence`}
      </button>
    </div>
  )
}
