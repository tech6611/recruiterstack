'use client'

import { useEffect, useState } from 'react'
import { ArrowDown, ArrowUp, Plus, RotateCcw, Save, Trash2, X, Calculator, ListTree } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { CRITERION_KIND_LABEL, type CriterionKind, type SearchCriterion, type SearchLevel, type SearchSpec } from '@/lib/types/search-spec'

/**
 * The acquisition ladder, editable (the "Juicebox" surface). Vendor-neutral: the
 * recruiter sees the exact criteria people will be acquired on — schools, employers,
 * titles, seniority, years, location — as chips they can add to, remove from and
 * reorder, level by level. "Count" shows how many people each level would reach on
 * the market source before anyone is acquired. Edits are saved on the ICP and win
 * over regeneration until reset.
 */

type Counts = Record<string, { total: number | null; error?: string | null }>

const CHIP_KINDS: CriterionKind[] = ['school', 'employer_current', 'employer_past', 'employer_any', 'title_current', 'title_any', 'seniority', 'function', 'skill', 'industry', 'company_size']
const ADDABLE_KINDS: CriterionKind[] = ['school', 'employer_current', 'employer_past', 'employer_any', 'title_current', 'title_any', 'seniority', 'function', 'skill']

let localSeq = 0
const newId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${++localSeq}`

function criterionText(c: SearchCriterion): string | null {
  if (c.kind === 'years_band') return c.min != null && c.max != null ? `${c.min}–${c.max} years` : c.min != null ? `${c.min}+ years` : c.max != null ? `≤ ${c.max} years` : null
  if (c.kind === 'grad_year_band') return `graduated ${c.min ?? '…'}–${c.max ?? '…'}`
  if (c.kind === 'location') return `within ${c.radius_km ?? 50} km of ${c.values[0] ?? '?'}`
  return null
}

function ChipGroup({ c, onChange, onRemove }: { c: SearchCriterion; onChange: (next: SearchCriterion) => void; onRemove: () => void }) {
  const [draft, setDraft] = useState('')
  const fixed = criterionText(c)
  const label = c.label ?? `${c.exclude ? 'Not ' : ''}${CRITERION_KIND_LABEL[c.kind]}`
  function add() {
    const v = draft.trim()
    if (!v) return
    if (c.values.some((x) => x.toLowerCase() === v.toLowerCase())) { setDraft(''); return }
    onChange({ ...c, values: [...c.values, v] })
    setDraft('')
  }
  return (
    <div className="flex flex-wrap items-center gap-1 text-xs">
      <span className="mr-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</span>
      {fixed ? (
        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-700">{fixed}</span>
      ) : (
        <>
          {c.values.map((v) => (
            <span key={v} className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] ${c.exclude ? 'bg-rose-50 text-rose-700' : 'bg-indigo-50 text-indigo-800'}`}>
              {v}
              <button type="button" aria-label={`Remove ${v}`} onClick={() => onChange({ ...c, values: c.values.filter((x) => x !== v) })} className="text-current/60 hover:text-current"><X className="h-3 w-3" /></button>
            </span>
          ))}
          {CHIP_KINDS.includes(c.kind) && (
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add() } }}
              onBlur={add}
              placeholder="add…"
              className="w-24 rounded border border-dashed border-slate-300 px-1.5 py-0.5 text-[11px] placeholder:text-slate-400 focus:border-indigo-300 focus:outline-none"
            />
          )}
        </>
      )}
      <button type="button" aria-label="Remove criterion" onClick={onRemove} className="ml-0.5 text-slate-300 hover:text-rose-500"><Trash2 className="h-3 w-3" /></button>
    </div>
  )
}

function AddCriterion({ onAdd }: { onAdd: (kind: CriterionKind) => void }) {
  const [kind, setKind] = useState<CriterionKind>('employer_current')
  return (
    <div className="flex items-center gap-1 text-[11px]">
      <select value={kind} onChange={(e) => setKind(e.target.value as CriterionKind)} className="rounded border border-slate-200 bg-white px-1 py-0.5 text-[11px] text-slate-600">
        {ADDABLE_KINDS.map((k) => <option key={k} value={k}>{CRITERION_KIND_LABEL[k]}</option>)}
      </select>
      <button type="button" onClick={() => onAdd(kind)} className="inline-flex items-center gap-0.5 text-indigo-600 hover:text-indigo-800"><Plus className="h-3 w-3" /> criterion</button>
    </div>
  )
}

export function SearchSpecEditor({ jobId, onSpecSaved }: { jobId: string; onSpecSaved?: (spec: SearchSpec) => void }) {
  const [spec, setSpec] = useState<SearchSpec | null>(null)
  const [stored, setStored] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [open, setOpen] = useState(true)
  const [saving, setSaving] = useState(false)
  const [counting, setCounting] = useState(false)
  const [counts, setCounts] = useState<Counts>({})
  const [countCredits, setCountCredits] = useState<number | null>(null)
  const [unsupported, setUnsupported] = useState<{ requirement: string; reason: string; level?: string }[]>([])

  useEffect(() => {
    fetch(`/api/jobs/${jobId}/source/spec`)
      .then((r) => (r.ok ? r.json() : { data: null }))
      .then((j) => { if (j.data?.spec) { setSpec(j.data.spec); setStored(!!j.data.stored) } })
      .catch(() => {})
  }, [jobId])

  function update(next: SearchSpec) { setSpec(next); setDirty(true); setCounts({}) }
  function setLevel(i: number, next: SearchLevel) { if (!spec) return; const levels = spec.levels.slice(); levels[i] = next; update({ ...spec, levels }) }
  function moveLevel(i: number, dir: -1 | 1) {
    if (!spec) return
    const j = i + dir
    if (j < 0 || j >= spec.levels.length) return
    const levels = spec.levels.slice(); const [l] = levels.splice(i, 1); levels.splice(j, 0, l); update({ ...spec, levels })
  }
  function addLevel() {
    if (!spec) return
    const last = spec.levels[spec.levels.length - 1]
    const copy: SearchLevel = { id: newId('L'), label: last ? `${last.label} (copy)` : 'New level', criteria: (last?.criteria ?? []).map((c) => ({ ...c, id: newId('c') })), relaxes: null }
    update({ ...spec, levels: [...spec.levels, copy] })
  }

  async function save() {
    if (!spec) return
    setSaving(true)
    const res = await fetch(`/api/jobs/${jobId}/source/spec`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ spec }) })
    setSaving(false)
    if (!res.ok) { const j = await res.json().catch(() => ({})); toast.error(j.error ?? 'Could not save the search plan'); return }
    const { data } = await res.json()
    setSpec(data.spec); setStored(true); setDirty(false)
    onSpecSaved?.(data.spec)
    toast.success('Search plan saved — the next "Find people" runs it.')
  }
  async function reset() {
    const res = await fetch(`/api/jobs/${jobId}/source/spec`, { method: 'DELETE' })
    if (!res.ok) { toast.error('Could not reset'); return }
    const { data } = await res.json()
    setSpec(data.spec); setStored(false); setDirty(false); setCounts({})
    toast('Reset to the brief’s proposal.')
  }
  async function count() {
    if (!spec) return
    setCounting(true)
    const res = await fetch(`/api/jobs/${jobId}/source/spec/counts`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ spec }) })
    setCounting(false)
    if (!res.ok) { const j = await res.json().catch(() => ({})); toast.error(j.error ?? 'Could not count'); return }
    const { data } = await res.json()
    const next: Counts = {}
    for (const c of data.counts as { key: string; total: number | null; error?: string | null }[]) next[c.key] = { total: c.total, error: c.error }
    setCounts(next); setCountCredits(data.creditsUsed ?? null); setUnsupported(data.unsupported ?? [])
  }

  if (!spec) return null
  // Count results are keyed by compiled lane key; map by level index (lanes compile in level order, skipping unsearchable levels).
  const countList = Object.values(counts)

  return (
    <section className="mt-3 rounded-xl border border-indigo-200 bg-indigo-50/40">
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5">
        <button type="button" onClick={() => setOpen((v) => !v)} className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
          <ListTree className="h-3.5 w-3.5 text-indigo-600" /> Search plan
          <span className="ml-1 rounded-full bg-white px-1.5 py-0.5 text-[10px] font-medium text-slate-500">{spec.levels.length} levels{stored ? ' · edited' : ' · proposed by the brief'}{dirty ? ' · unsaved' : ''}</span>
        </button>
        <div className="flex items-center gap-1.5">
          <Button size="sm" variant="outline" onClick={count} loading={counting}><Calculator className="h-3.5 w-3.5" /> Count</Button>
          {stored && <Button size="sm" variant="ghost" onClick={reset}><RotateCcw className="h-3.5 w-3.5" /> Reset</Button>}
          <Button size="sm" onClick={save} loading={saving} disabled={!dirty}><Save className="h-3.5 w-3.5" /> Save plan</Button>
        </div>
      </div>
      {open && (
        <div className="space-y-3 px-3 pb-3">
          <p className="text-[11px] text-slate-500">
            People are found level by level, top to bottom — each level is used up before the next opens. Every level also
            requires the must-have line. Edit the chips to change who gets acquired; “Count” shows how many people each
            level reaches before anyone is acquired{countCredits != null ? ` (last count cost ${countCredits.toFixed(2)} credits)` : ''}.
          </p>

          {/* must-have line */}
          <div className="rounded-lg border border-rose-200 bg-white px-2.5 py-2">
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-rose-600">Must-have line · applies to every level</div>
            <div className="space-y-1">
              {spec.base.map((c, i) => (
                <ChipGroup key={c.id} c={c} onChange={(n) => { const base = spec.base.slice(); base[i] = n; update({ ...spec, base }) }} onRemove={() => update({ ...spec, base: spec.base.filter((_, k) => k !== i) })} />
              ))}
              <AddCriterion onAdd={(kind) => update({ ...spec, base: [...spec.base, { id: newId('c'), kind, values: [] }] })} />
            </div>
          </div>

          {/* levels */}
          <ol className="space-y-2">
            {spec.levels.map((lvl, i) => {
              const cnt = countList.length ? countList[Math.min(i, countList.length - 1)] : null
              return (
                <li key={lvl.id} className="rounded-lg border border-slate-200 bg-white px-2.5 py-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <span className="rounded bg-indigo-100 px-1.5 py-0.5 text-[10px] font-bold text-indigo-800">L{i + 1}</span>
                      <input value={lvl.label} onChange={(e) => setLevel(i, { ...lvl, label: e.target.value })} className="w-72 rounded border border-transparent bg-transparent px-1 text-xs font-medium text-slate-800 hover:border-slate-200 focus:border-indigo-300 focus:outline-none" />
                      {lvl.relaxes && <span className="text-[10px] text-amber-700">relaxes: {lvl.relaxes}</span>}
                    </div>
                    <div className="flex items-center gap-1 text-[11px] text-slate-500">
                      {Object.keys(counts).length > 0 && (
                        <span className="mr-1 rounded bg-slate-100 px-1.5 py-0.5 font-medium text-slate-700">
                          {cnt?.error ? 'error' : cnt?.total != null ? `${cnt.total.toLocaleString()} people` : '—'}
                        </span>
                      )}
                      <button type="button" aria-label="Move up" onClick={() => moveLevel(i, -1)} className="text-slate-300 hover:text-slate-600"><ArrowUp className="h-3.5 w-3.5" /></button>
                      <button type="button" aria-label="Move down" onClick={() => moveLevel(i, 1)} className="text-slate-300 hover:text-slate-600"><ArrowDown className="h-3.5 w-3.5" /></button>
                      <button type="button" aria-label="Delete level" onClick={() => update({ ...spec, levels: spec.levels.filter((_, k) => k !== i) })} className="text-slate-300 hover:text-rose-500"><Trash2 className="h-3.5 w-3.5" /></button>
                    </div>
                  </div>
                  <div className="mt-1.5 space-y-1">
                    {lvl.criteria.map((c, k) => (
                      <ChipGroup key={c.id} c={c} onChange={(n) => { const criteria = lvl.criteria.slice(); criteria[k] = n; setLevel(i, { ...lvl, criteria }) }} onRemove={() => setLevel(i, { ...lvl, criteria: lvl.criteria.filter((_, x) => x !== k) })} />
                    ))}
                    <AddCriterion onAdd={(kind) => setLevel(i, { ...lvl, criteria: [...lvl.criteria, { id: newId('c'), kind, values: [] }] })} />
                  </div>
                </li>
              )
            })}
          </ol>
          <button type="button" onClick={addLevel} className="inline-flex items-center gap-1 text-[11px] text-indigo-600 hover:text-indigo-800"><Plus className="h-3 w-3" /> Add a level (copies the last one)</button>

          {spec.post_fetch.length > 0 && (
            <div className="rounded-lg border border-slate-200 bg-white px-2.5 py-2">
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Verified after fetch · not searchable on any source</div>
              <ul className="space-y-0.5">
                {spec.post_fetch.map((p, i) => (
                  <li key={i} className="text-[11px] text-slate-600">
                    <span className="mr-1 rounded bg-slate-100 px-1 py-0.5 text-[9px] font-semibold uppercase text-slate-500">{p.how === 'judge' ? 'AI judge' : p.how === 'screen' ? 'screen' : 'computed'}</span>
                    {p.label}{p.note && <span className="text-slate-400"> — {p.note}</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {unsupported.length > 0 && (
            <div className="text-[11px] text-amber-700">Not searchable on the market source (checked after fetch): {unsupported.map((u) => `${u.requirement}${u.level ? ` (${u.level})` : ''}`).join(' · ')}</div>
          )}
        </div>
      )}
    </section>
  )
}
