'use client'

import { useEffect, useState } from 'react'
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, Plus, RotateCcw, Save, Trash2, X, Calculator, Radar, Pencil } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { CRITERION_KIND_LABEL, type CriterionKind, type SearchCriterion, type SearchLevel, type SearchSpec } from '@/lib/types/search-spec'

/**
 * The search plan, read like a recruiter would say it and edited on its own page.
 *
 *  - Collapsed: one line ("9 levels · first: … · 150 in L1 · edited") + Count / Find people.
 *  - Open: the must-have line and every level as a SENTENCE ("Tier-1 school · now at
 *    McKinsey, Bain +2 · as Business Analyst, Associate"), with the count and what the
 *    last run took. No chips here.
 *  - Edit: a full-width modal with chips per filter, an exclude ("not") toggle on every
 *    filter, rename / reorder / delete levels, add levels and filters, Save / Reset.
 *
 * Vendor-neutral; a source that can't express a filter reports it after Count.
 */

export interface LevelRunStat { key: string; fetched: number; total: number | null; exhausted?: boolean; error?: string | null }
type Counts = Record<string, { total: number | null; error?: string | null }>

const CHIP_KINDS: CriterionKind[] = ['school', 'degree_field', 'employer_current', 'employer_past', 'employer_any', 'title_current', 'title_any', 'seniority', 'function', 'skill', 'industry', 'company_size', 'company_type', 'funding_stage']
const ADDABLE_KINDS: CriterionKind[] = ['school', 'degree_field', 'employer_current', 'employer_past', 'employer_any', 'title_current', 'title_any', 'seniority', 'function', 'skill', 'industry', 'company_size', 'company_type', 'funding_stage', 'location']
/** Kinds that can be flipped to "not". */
const EXCLUDABLE: CriterionKind[] = ['school', 'degree_field', 'employer_current', 'employer_past', 'employer_any', 'title_current', 'title_any', 'seniority', 'function', 'skill', 'industry', 'company_size', 'company_type', 'location']
const SHORT_KIND: Record<CriterionKind, string> = {
  school: 'school', employer_current: 'now at', employer_past: 'was at', employer_any: 'ever at', title_current: 'title', title_any: 'any title',
  seniority: 'level', function: 'function', years_band: 'years', grad_year_band: 'graduated', degree_field: 'degree', location: 'near', skill: 'skill', industry: 'industry',
  company_size: 'company size', company_type: 'company type', funding_stage: 'funding stage',
}
const SIZE_BANDS = ['1-10', '11-50', '51-200', '201-500', '501-1000', '1001-5000', '5001-10000', '10001+']

let localSeq = 0
const newId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${++localSeq}`

function fixedText(c: SearchCriterion): string | null {
  if (c.kind === 'years_band') return c.min != null && c.max != null ? `${c.min}–${c.max} yrs` : c.min != null ? `${c.min}+ yrs` : c.max != null ? `≤ ${c.max} yrs` : null
  if (c.kind === 'grad_year_band') return `${c.min ?? '…'}–${c.max ?? '…'}`
  if (c.kind === 'location') return `${c.values[0] ?? '?'} · ${c.radius_km ?? 50} km`
  return null
}

/** "now at McKinsey, Bain +2" — one filter as a phrase. */
export function criterionPhrase(c: SearchCriterion, max = 3): string {
  const fixed = fixedText(c)
  const body = fixed ?? (c.values.slice(0, max).join(', ') + (c.values.length > max ? ` +${c.values.length - max}` : ''))
  return `${c.exclude ? 'not ' : ''}${SHORT_KIND[c.kind]} ${body}`.trim()
}
/** A whole level as a sentence. */
export function levelSentence(lvl: SearchLevel): string {
  return lvl.criteria.map((c) => criterionPhrase(c)).join(' · ')
}

function Chips({ c, onChange, onRemove }: { c: SearchCriterion; onChange: (next: SearchCriterion) => void; onRemove: () => void }) {
  const [draft, setDraft] = useState('')
  const fixed = fixedText(c)
  const canExclude = EXCLUDABLE.includes(c.kind)
  function add() {
    const v = draft.trim()
    if (v && !c.values.some((x) => x.toLowerCase() === v.toLowerCase())) onChange({ ...c, values: [...c.values, v] })
    setDraft('')
  }
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="w-24 shrink-0 text-[10px] font-semibold uppercase tracking-wide text-slate-400" title={CRITERION_KIND_LABEL[c.kind]}>{SHORT_KIND[c.kind]}</span>
      {canExclude && (
        <button type="button" onClick={() => onChange({ ...c, exclude: !c.exclude })} title={c.exclude ? 'Excluding these — click to include' : 'Including these — click to exclude'}
          className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${c.exclude ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-500'}`}>
          {c.exclude ? 'NOT' : 'IS'}
        </button>
      )}
      {fixed && c.kind !== 'location' ? (
        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-700">{fixed}</span>
      ) : c.kind === 'location' ? (
        <>
          <input value={c.values[0] ?? ''} onChange={(e) => onChange({ ...c, values: [e.target.value] })} placeholder="City, Country" className="w-44 rounded border border-slate-200 px-1.5 py-0.5 text-[11px] focus:border-indigo-300 focus:outline-none" />
          <input type="number" min={1} max={2000} value={c.radius_km ?? 50} onChange={(e) => onChange({ ...c, radius_km: Number(e.target.value) || 50 })} className="w-16 rounded border border-slate-200 px-1.5 py-0.5 text-[11px]" /><span className="text-[11px] text-slate-400">km</span>
        </>
      ) : c.kind === 'company_size' ? (
        <>
          {SIZE_BANDS.map((b) => (
            <button key={b} type="button" onClick={() => onChange({ ...c, values: c.values.includes(b) ? c.values.filter((v) => v !== b) : [...c.values, b] })}
              className={`rounded px-1.5 py-0.5 text-[11px] ${c.values.includes(b) ? (c.exclude ? 'bg-rose-50 text-rose-700' : 'bg-indigo-50 text-indigo-800') : 'bg-white text-slate-500 ring-1 ring-slate-200'}`}>{b}</button>
          ))}
        </>
      ) : (
        <>
          {c.values.map((v) => (
            <span key={v} className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] ${c.exclude ? 'bg-rose-50 text-rose-700' : 'bg-indigo-50 text-indigo-800'}`}>
              {v}
              <button type="button" aria-label={`Remove ${v}`} onClick={() => onChange({ ...c, values: c.values.filter((x) => x !== v) })} className="opacity-60 hover:opacity-100"><X className="h-3 w-3" /></button>
            </span>
          ))}
          {CHIP_KINDS.includes(c.kind) && (
            <input value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add() } }} onBlur={add}
              placeholder="+ add" className="w-16 rounded border border-dashed border-slate-300 px-1.5 py-0.5 text-[11px] placeholder:text-slate-400 focus:w-36 focus:border-indigo-300 focus:outline-none" />
          )}
        </>
      )}
      <button type="button" aria-label="Remove filter" onClick={onRemove} className="text-slate-300 hover:text-rose-500"><Trash2 className="h-3 w-3" /></button>
    </div>
  )
}

function AddFilter({ onAdd }: { onAdd: (kind: CriterionKind) => void }) {
  return (
    <select value="" onChange={(e) => { if (e.target.value) onAdd(e.target.value as CriterionKind) }} className="rounded border border-dashed border-slate-300 bg-white px-1 py-0.5 text-[11px] text-slate-500">
      <option value="">+ filter</option>
      {ADDABLE_KINDS.map((k) => <option key={k} value={k}>{CRITERION_KIND_LABEL[k]}</option>)}
    </select>
  )
}

export function SearchSpecEditor({ jobId, onFind, finding, lastRun, initialSpec, readOnly }: {
  jobId: string
  onFind?: () => void
  finding?: boolean
  lastRun?: LevelRunStat[] | null
  /** Preview/testing: render this spec instead of fetching it. */
  initialSpec?: SearchSpec | null
  /** Preview/testing: no network actions. */
  readOnly?: boolean
}) {
  const [spec, setSpec] = useState<SearchSpec | null>(initialSpec ?? null)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<SearchSpec | null>(null)
  const [stored, setStored] = useState(false)
  const [saving, setSaving] = useState(false)
  const [counting, setCounting] = useState(false)
  const [counts, setCounts] = useState<Counts>({})
  const [unsupported, setUnsupported] = useState<{ requirement: string; reason: string; level?: string }[]>([])
  const [showPostFetch, setShowPostFetch] = useState(false)

  useEffect(() => {
    if (initialSpec) return
    fetch(`/api/jobs/${jobId}/source/spec`)
      .then((r) => (r.ok ? r.json() : { data: null }))
      .then((j) => { if (j.data?.spec) { setSpec(j.data.spec); setStored(!!j.data.stored) } })
      .catch(() => {})
  }, [jobId, initialSpec])

  async function count(target: SearchSpec) {
    if (readOnly) return
    setCounting(true)
    const res = await fetch(`/api/jobs/${jobId}/source/spec/counts`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ spec: target }) })
    setCounting(false)
    if (!res.ok) { const j = await res.json().catch(() => ({})); toast.error(j.error ?? 'Could not count'); return }
    const { data } = await res.json()
    const next: Counts = {}
    for (const c of data.counts as { key: string; total: number | null; error?: string | null }[]) next[c.key] = { total: c.total, error: c.error }
    setCounts(next); setUnsupported(data.unsupported ?? [])
  }
  async function save(next: SearchSpec): Promise<boolean> {
    if (readOnly) { setSpec(next); return true }
    setSaving(true)
    const res = await fetch(`/api/jobs/${jobId}/source/spec`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ spec: next }) })
    setSaving(false)
    if (!res.ok) { const j = await res.json().catch(() => ({})); toast.error(j.error ?? 'Could not save'); return false }
    const { data } = await res.json()
    setSpec(data.spec); setStored(true); setCounts({})
    return true
  }
  async function reset() {
    if (readOnly) return
    const res = await fetch(`/api/jobs/${jobId}/source/spec`, { method: 'DELETE' })
    if (!res.ok) { toast.error('Could not reset'); return }
    const { data } = await res.json()
    setSpec(data.spec); setDraft(data.spec); setStored(false); setCounts({})
  }

  if (!spec) return null
  const byIndex = (i: number) => Object.entries(counts).find(([k]) => k.startsWith(`L${i + 1}:`))?.[1]
  const runByIndex = (i: number) => (lastRun ?? []).find((r) => r.key.startsWith(`L${i + 1}:`))
  const baseSentence = spec.base.map((c) => criterionPhrase(c)).join(' · ')

  return (
    <section className="mt-3 rounded-xl border border-slate-200 bg-white">
      {/* one-line summary */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
        <button type="button" onClick={() => setOpen((v) => !v)} className="flex min-w-0 items-center gap-2 text-left text-xs" title="Who gets acquired, in order. Click to read it.">
          {open ? <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-400" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-400" />}
          <span className="font-semibold text-slate-700">Search plan</span>
          <span className="truncate text-slate-500">
            {spec.levels.length} levels
            {spec.levels[0] && <> · first: <span className="text-slate-700">{spec.levels[0].label}</span></>}
            {(() => { const c = byIndex(0); return c?.total != null ? <> · {c.total.toLocaleString()} people in L1</> : null })()}
            {(() => { const r = runByIndex(0); return r?.fetched ? <> · +{r.fetched} last run</> : null })()}
            {stored ? ' · edited' : ''}
          </span>
        </button>
        <div className="flex items-center gap-1.5">
          {!readOnly && <Button size="sm" variant="ghost" onClick={() => count(spec)} loading={counting} title="How many people each level reaches, before anyone is acquired"><Calculator className="h-3.5 w-3.5" /> Count</Button>}
          <Button size="sm" variant="outline" onClick={() => { setDraft(JSON.parse(JSON.stringify(spec))); setEditing(true) }}><Pencil className="h-3.5 w-3.5" /> Edit</Button>
          {onFind && !readOnly && <Button size="sm" onClick={onFind} loading={finding} title="Acquire people, level 1 first"><Radar className="h-3.5 w-3.5" /> Find people</Button>}
        </div>
      </div>

      {/* read-only sentences */}
      {open && (
        <div className="border-t border-slate-100">
          {baseSentence && <div className="px-3 py-1.5 text-xs text-slate-600"><span className="font-semibold uppercase tracking-wide text-[10px] text-rose-500">Everyone</span> · {baseSentence}</div>}
          <ol className="divide-y divide-slate-100 border-t border-slate-100">
            {spec.levels.map((lvl, i) => {
              const cnt = byIndex(i); const run = runByIndex(i)
              return (
                <li key={lvl.id} className="flex items-center gap-2 px-3 py-1.5 text-xs">
                  <span className="shrink-0 rounded bg-indigo-100 px-1.5 py-0.5 text-[10px] font-bold text-indigo-800">L{i + 1}</span>
                  <span className="min-w-0 flex-1 truncate text-slate-600" title={`${lvl.label}${lvl.relaxes ? ` — relaxes: ${lvl.relaxes}` : ''}\n${levelSentence(lvl)}`}>
                    <span className="font-medium text-slate-800">{lvl.label}</span> — {levelSentence(lvl)}
                  </span>
                  <span className="shrink-0 text-[11px] text-slate-500">
                    {run && (run.fetched > 0 || run.exhausted) && <span className={`mr-1.5 rounded px-1.5 py-0.5 ${run.exhausted ? 'bg-slate-100 text-slate-500' : 'bg-emerald-50 text-emerald-700'}`}>{run.fetched > 0 ? `+${run.fetched}` : ''}{run.exhausted ? ' done' : ''}</span>}
                    {cnt && <span className="rounded bg-slate-100 px-1.5 py-0.5 font-medium text-slate-700">{cnt.error ? '—' : cnt.total != null ? cnt.total.toLocaleString() : '—'}</span>}
                  </span>
                </li>
              )
            })}
          </ol>
          {spec.post_fetch.length > 0 && (
            <div className="border-t border-slate-100 px-3 py-1.5 text-[11px]">
              <button type="button" onClick={() => setShowPostFetch((v) => !v)} className="text-slate-400 hover:text-slate-600">{spec.post_fetch.length} checks after fetch {showPostFetch ? '▾' : '▸'}</button>
              {showPostFetch && <ul className="mt-1 text-slate-500">{spec.post_fetch.map((p, i) => <li key={i} title={p.note ?? undefined}><span className="mr-1 rounded bg-slate-100 px-1 text-[9px] font-semibold uppercase">{p.how === 'judge' ? 'AI' : p.how === 'screen' ? 'screen' : 'computed'}</span>{p.label}</li>)}</ul>}
            </div>
          )}
          {unsupported.length > 0 && <div className="border-t border-slate-100 px-3 py-1.5 text-[11px] text-amber-700">Not searchable on the market source (checked after fetch): {unsupported.map((u) => u.requirement).join(' · ')}</div>}
        </div>
      )}

      {/* edit page (modal) */}
      {editing && draft && (
        <SpecEditModal
          draft={draft} setDraft={setDraft} counts={counts} counting={counting} saving={saving} stored={stored} readOnly={!!readOnly}
          onCount={() => count(draft)} onReset={reset} onCancel={() => setEditing(false)}
          onSave={async () => { if (await save(draft)) setEditing(false) }}
        />
      )}
    </section>
  )
}

function SpecEditModal({ draft, setDraft, counts, counting, saving, stored, readOnly, onCount, onReset, onCancel, onSave }: {
  draft: SearchSpec; setDraft: (s: SearchSpec) => void; counts: Counts; counting: boolean; saving: boolean; stored: boolean; readOnly: boolean
  onCount: () => void; onReset: () => void; onCancel: () => void; onSave: () => void
}) {
  const update = (next: SearchSpec) => setDraft(next)
  const setLevel = (i: number, next: SearchLevel) => { const levels = draft.levels.slice(); levels[i] = next; update({ ...draft, levels }) }
  const moveLevel = (i: number, dir: -1 | 1) => { const j = i + dir; if (j < 0 || j >= draft.levels.length) return; const levels = draft.levels.slice(); const [l] = levels.splice(i, 1); levels.splice(j, 0, l); update({ ...draft, levels }) }
  const addLevel = () => { const last = draft.levels[draft.levels.length - 1]; update({ ...draft, levels: [...draft.levels, { id: newId('L'), label: last ? `${last.label} (copy)` : 'New level', criteria: (last?.criteria ?? []).map((c) => ({ ...c, id: newId('c') })), relaxes: null }] }) }
  const byIndex = (i: number) => Object.entries(counts).find(([k]) => k.startsWith(`L${i + 1}:`))?.[1]
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 md:p-8" onClick={onCancel}>
      <div className="w-full max-w-4xl rounded-xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <div className="text-sm font-semibold text-slate-800">Edit search plan</div>
          <div className="flex items-center gap-1.5">
            {!readOnly && <Button size="sm" variant="ghost" onClick={onCount} loading={counting}><Calculator className="h-3.5 w-3.5" /> Count</Button>}
            {stored && !readOnly && <Button size="sm" variant="ghost" onClick={onReset} title="Back to the plan the ICP proposed"><RotateCcw className="h-3.5 w-3.5" /> Reset</Button>}
            <Button size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
            <Button size="sm" onClick={onSave} loading={saving}><Save className="h-3.5 w-3.5" /> Save</Button>
          </div>
        </div>

        <div className="border-b border-slate-100 px-4 py-3">
          <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-rose-500" title="Applied to every level, never relaxed">Everyone</div>
          <div className="space-y-1.5">
            {draft.base.map((c, i) => <Chips key={c.id} c={c} onChange={(n) => { const base = draft.base.slice(); base[i] = n; update({ ...draft, base }) }} onRemove={() => update({ ...draft, base: draft.base.filter((_, k) => k !== i) })} />)}
            <AddFilter onAdd={(kind) => update({ ...draft, base: [...draft.base, { id: newId('c'), kind, values: [] }] })} />
          </div>
        </div>

        <ol className="divide-y divide-slate-100">
          {draft.levels.map((lvl, i) => {
            const cnt = byIndex(i)
            return (
              <li key={lvl.id} className="px-4 py-3">
                <div className="mb-1.5 flex items-center gap-2">
                  <span className="shrink-0 rounded bg-indigo-100 px-1.5 py-0.5 text-[10px] font-bold text-indigo-800">L{i + 1}</span>
                  <input value={lvl.label} onChange={(e) => setLevel(i, { ...lvl, label: e.target.value })} className="w-96 rounded border border-transparent px-1 text-xs font-medium text-slate-800 hover:border-slate-200 focus:border-indigo-300 focus:outline-none" />
                  {cnt && <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-700">{cnt.error ? '—' : cnt.total != null ? `${cnt.total.toLocaleString()} people` : '—'}</span>}
                  <span className="ml-auto flex items-center gap-1">
                    <button type="button" aria-label="Move up" onClick={() => moveLevel(i, -1)} className="text-slate-300 hover:text-slate-600"><ArrowUp className="h-3.5 w-3.5" /></button>
                    <button type="button" aria-label="Move down" onClick={() => moveLevel(i, 1)} className="text-slate-300 hover:text-slate-600"><ArrowDown className="h-3.5 w-3.5" /></button>
                    <button type="button" aria-label="Delete level" onClick={() => update({ ...draft, levels: draft.levels.filter((_, k) => k !== i) })} className="text-slate-300 hover:text-rose-500"><Trash2 className="h-3.5 w-3.5" /></button>
                  </span>
                </div>
                <div className="space-y-1.5 pl-7">
                  {lvl.criteria.map((c, k) => <Chips key={c.id} c={c} onChange={(n) => { const criteria = lvl.criteria.slice(); criteria[k] = n; setLevel(i, { ...lvl, criteria }) }} onRemove={() => setLevel(i, { ...lvl, criteria: lvl.criteria.filter((_, x) => x !== k) })} />)}
                  <AddFilter onAdd={(kind) => setLevel(i, { ...lvl, criteria: [...lvl.criteria, { id: newId('c'), kind, values: [] }] })} />
                </div>
              </li>
            )
          })}
        </ol>
        <div className="flex items-center justify-between border-t border-slate-100 px-4 py-2 text-[11px]">
          <button type="button" onClick={addLevel} className="inline-flex items-center gap-1 text-indigo-600 hover:text-indigo-800"><Plus className="h-3 w-3" /> level (copies the last one)</button>
          <span className="text-slate-400">Levels are searched top to bottom; each is used up before the next opens.</span>
        </div>
      </div>
    </div>
  )
}
