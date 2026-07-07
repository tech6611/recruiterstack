'use client'

import { useEffect, useState, useCallback } from 'react'
import { X, Loader2, Users, Filter } from 'lucide-react'

interface Opt { value: string; label: string }

const STATUS_OPTIONS: Opt[] = [
  { value: 'active', label: 'Active' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'withdrawn', label: 'Withdrawn' },
  { value: 'hired', label: 'Hired' },
]

function FilterSection({ label, options, selected, onToggle, searchable }: {
  label: string
  options: Opt[]
  selected: string[]
  onToggle: (v: string) => void
  searchable?: boolean
}) {
  const [q, setQ] = useState('')
  const shown = q ? options.filter(o => o.label.toLowerCase().includes(q.toLowerCase())) : options
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <label className="text-xs font-semibold text-slate-500">{label}</label>
        {selected.length > 0 && <span className="text-[11px] font-semibold text-emerald-600">{selected.length} selected</span>}
      </div>
      {searchable && options.length > 8 && (
        <input
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder={`Search ${label.toLowerCase()}…`}
          className="mb-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs text-slate-800 placeholder-slate-400 outline-none focus:border-emerald-400"
        />
      )}
      {options.length === 0 ? (
        <p className="text-[11px] text-slate-400">None available</p>
      ) : (
        <div className="max-h-36 divide-y divide-slate-50 overflow-y-auto rounded-xl border border-slate-200">
          {shown.map(o => (
            <label key={o.value} className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm hover:bg-slate-50">
              <input
                type="checkbox"
                checked={selected.includes(o.value)}
                onChange={() => onToggle(o.value)}
                className="text-emerald-600 focus:ring-emerald-500"
              />
              <span className="truncate text-slate-700">{o.label}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  )
}

export default function BulkEnrollDrawer({ sequenceId, active, onClose, onEnrolled }: {
  sequenceId: string
  active: boolean
  onClose: () => void
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

  const [count, setCount] = useState<number | null>(null)
  const [counting, setCounting] = useState(false)
  const [enrolling, setEnrolling] = useState(false)
  const [result, setResult] = useState<{ enrolled: number; skipped: number } | null>(null)
  const [error, setError] = useState('')

  const toggle = (setter: React.Dispatch<React.SetStateAction<string[]>>) => (v: string) =>
    setter(prev => prev.includes(v) ? prev.filter(x => x !== v) : [...prev, v])

  // Load filter options.
  useEffect(() => {
    (async () => {
      const [dRes, jRes, oRes] = await Promise.all([
        fetch('/api/departments'),
        fetch('/api/jobs'),
        fetch('/api/automations/options'),
      ])
      if (dRes.ok) setDepartments(((await dRes.json()).data ?? []).map((d: { id: string; name: string }) => ({ value: d.id, label: d.name })))
      if (jRes.ok) setJobs(((await jRes.json()).data ?? []).map((j: { id: string; title: string }) => ({ value: j.id, label: j.title })))
      if (oRes.ok) {
        const o = (await oRes.json()).data ?? { tags: [], stages: [] }
        setStageOpts((o.stages ?? []).map((s: string) => ({ value: s, label: s })))
        setTagOpts((o.tags ?? []).map((t: string) => ({ value: t, label: t })))
      }
    })()
  }, [])

  const filters = useCallback(() => ({
    department_ids: deptIds,
    job_ids: jobIds,
    stage_names: stageNames,
    tags,
    statuses,
    exclude_do_not_contact: excludeDNC,
  }), [deptIds, jobIds, stageNames, tags, statuses, excludeDNC])

  const anyFilter = deptIds.length || jobIds.length || stageNames.length || tags.length || statuses.length

  // Live count (debounced).
  useEffect(() => {
    setResult(null)
    if (!anyFilter) { setCount(null); return }
    setCounting(true)
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/sequences/${sequenceId}/enroll-by-filter`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filters: filters(), dryRun: true }),
        })
        const json = await res.json()
        setCount(res.ok ? (json.data?.matched ?? 0) : null)
        if (!res.ok) setError(json.error ?? '')
      } finally {
        setCounting(false)
      }
    }, 400)
    return () => clearTimeout(t)
  }, [anyFilter, filters, sequenceId])

  const enroll = async () => {
    setEnrolling(true)
    setError('')
    const res = await fetch(`/api/sequences/${sequenceId}/enroll-by-filter`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filters: filters() }),
    })
    const json = await res.json()
    setEnrolling(false)
    if (!res.ok) { setError(json.error ?? 'Failed to enroll'); return }
    setResult({ enrolled: json.data.enrolled, skipped: json.data.skipped })
    onEnrolled()
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative flex h-full w-full max-w-md flex-col bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div className="flex items-center gap-2">
            <Filter className="h-5 w-5 text-slate-500" />
            <h2 className="text-base font-bold text-slate-900">Bulk enroll by filter</h2>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"><X className="h-4 w-4" /></button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
          {!active && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
              <p className="text-xs font-medium text-amber-700">Sequence isn&apos;t active.</p>
              <p className="text-[11px] text-amber-600">Activate it before enrolling candidates.</p>
            </div>
          )}
          <p className="text-[11px] text-slate-400">
            Pick any combination of filters — candidates must match <b>all</b> the boxes you set.
          </p>

          <FilterSection label="Department" options={departments} selected={deptIds} onToggle={toggle(setDeptIds)} searchable />
          <FilterSection label="Jobs" options={jobs} selected={jobIds} onToggle={toggle(setJobIds)} searchable />
          <FilterSection label="Stages" options={stageOpts} selected={stageNames} onToggle={toggle(setStageNames)} />
          <FilterSection label="Tags" options={tagOpts} selected={tags} onToggle={toggle(setTags)} searchable />
          <FilterSection label="Application status" options={STATUS_OPTIONS} selected={statuses} onToggle={toggle(setStatuses)} />

          <label className="flex items-center gap-2 text-xs text-slate-600">
            <input type="checkbox" checked={excludeDNC} onChange={e => setExcludeDNC(e.target.checked)} className="text-emerald-600 focus:ring-emerald-500" />
            Skip candidates tagged do-not-contact
          </label>

          {error && <p className="text-xs font-medium text-red-500">{error}</p>}
        </div>

        <div className="border-t border-slate-100 px-6 py-4">
          <div className="mb-3 text-center text-sm">
            {!anyFilter ? (
              <span className="text-slate-400">Set at least one filter</span>
            ) : counting ? (
              <span className="flex items-center justify-center gap-1.5 text-slate-400"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Counting…</span>
            ) : result ? (
              <span className="font-semibold text-emerald-700">Enrolled {result.enrolled} · skipped {result.skipped} (already enrolled)</span>
            ) : (
              <span className="font-semibold text-slate-800">{count ?? 0} candidate{count === 1 ? '' : 's'} match</span>
            )}
          </div>
          <button
            onClick={enroll}
            disabled={enrolling || !anyFilter || !active || !count || !!result}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#221b14] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#33271b] disabled:opacity-50"
          >
            {enrolling ? <Loader2 className="h-4 w-4 animate-spin" /> : <Users className="h-4 w-4" />}
            {result ? 'Done' : `Enroll ${count ?? 0} into this sequence`}
          </button>
        </div>
      </div>
    </div>
  )
}
