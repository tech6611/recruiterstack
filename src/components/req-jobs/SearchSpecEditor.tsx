'use client'

import { useEffect, useState } from 'react'
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, Plus, RotateCcw, Save, Trash2, X, Calculator, Radar } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { CRITERION_KIND_LABEL, type CriterionKind, type SearchCriterion, type SearchLevel, type SearchSpec } from '@/lib/types/search-spec'

/**
 * The search plan as a control panel (Juicebox-shaped): one row of must-have chips,
 * then one compact row per level — badge, name, its chips, how many people it reaches,
 * what the last run took from it. Click a row to edit its chips, reorder or delete it.
 * No prose; explanations live in hover titles. Edits save on the ICP and win over
 * regeneration until reset. The source is never named.
 */

export interface LevelRunStat { key: string; fetched: number; total: number | null; exhausted?: boolean; error?: string | null }
type Counts = Record<string, { total: number | null; error?: string | null }>

const CHIP_KINDS: CriterionKind[] = ['school', 'employer_current', 'employer_past', 'employer_any', 'title_current', 'title_any', 'seniority', 'function', 'skill', 'industry', 'company_size']
const ADDABLE_KINDS: CriterionKind[] = ['school', 'employer_current', 'employer_past', 'employer_any', 'title_current', 'title_any', 'seniority', 'function', 'skill']
const SHORT_KIND: Record<CriterionKind, string> = {
  school: 'School', employer_current: 'Now at', employer_past: 'Was at', employer_any: 'Ever at', title_current: 'Title', title_any: 'Any title',
  seniority: 'Level', function: 'Function', years_band: 'Years', grad_year_band: 'Graduated', location: 'Near', skill: 'Skill', industry: 'Industry', company_size: 'Size',
}

let localSeq = 0
const newId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${++localSeq}`

function fixedText(c: SearchCriterion): string | null {
  if (c.kind === 'years_band') return c.min != null && c.max != null ? `${c.min}–${c.max} yrs` : c.min != null ? `${c.min}+ yrs` : c.max != null ? `≤ ${c.max} yrs` : null
  if (c.kind === 'grad_year_band') return `${c.min ?? '…'}–${c.max ?? '…'}`
  if (c.kind === 'location') return `${c.values[0] ?? '?'} · ${c.radius_km ?? 50} km`
  return null
}

/** Compact, read-only rendering of a level's criteria: "Now at McKinsey, Bain +1 · Title Associate +2". */
function Summary({ criteria }: { criteria: SearchCriterion[] }) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-slate-600">
      {criteria.map((c) => {
        const fixed = fixedText(c)
        const shown = fixed ? [fixed] : c.values.slice(0, 2)
        const more = fixed ? 0 : c.values.length - shown.length
        return (
          <span key={c.id} className="inline-flex items-center gap-1 whitespace-nowrap" title={c.values.join(', ')}>
            <span className={`font-medium ${c.exclude ? 'text-rose-600' : 'text-slate-400'}`}>{c.exclude ? 'not ' : ''}{SHORT_KIND[c.kind]}</span>
            <span className="text-slate-700">{shown.join(', ')}{more > 0 ? ` +${more}` : ''}</span>
          </span>
        )
      })}
    </div>
  )
}

function Chips({ c, onChange, onRemove }: { c: SearchCriterion; onChange: (next: SearchCriterion) => void; onRemove: () => void }) {
  const [draft, setDraft] = useState('')
  const fixed = fixedText(c)
  function add() {
    const v = draft.trim()
    if (v && !c.values.some((x) => x.toLowerCase() === v.toLowerCase())) onChange({ ...c, values: [...c.values, v] })
    setDraft('')
  }
  return (
    <div className="flex flex-wrap items-center gap-1">
      <span className={`w-16 shrink-0 text-[10px] font-semibold uppercase tracking-wide ${c.exclude ? 'text-rose-500' : 'text-slate-400'}`} title={CRITERION_KIND_LABEL[c.kind]}>{c.exclude ? 'not ' : ''}{SHORT_KIND[c.kind]}</span>
      {fixed ? (
        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-700">{fixed}</span>
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
              placeholder="+ add" className="w-16 rounded border border-dashed border-slate-300 px-1.5 py-0.5 text-[11px] placeholder:text-slate-400 focus:w-32 focus:border-indigo-300 focus:outline-none" />
          )}
        </>
      )}
      <button type="button" aria-label="Remove" onClick={onRemove} className="text-slate-300 hover:text-rose-500"><Trash2 className="h-3 w-3" /></button>
    </div>
  )
}

function AddCriterion({ onAdd }: { onAdd: (kind: CriterionKind) => void }) {
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
  const [stored, setStored] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [counting, setCounting] = useState(false)
  const [counts, setCounts] = useState<Counts>({})
  const [expanded, setExpanded] = useState<string | null>(null)
  const [showPostFetch, setShowPostFetch] = useState(false)

  useEffect(() => {
    if (initialSpec) return
    fetch(`/api/jobs/${jobId}/source/spec`)
      .then((r) => (r.ok ? r.json() : { data: null }))
      .then((j) => { if (j.data?.spec) { setSpec(j.data.spec); setStored(!!j.data.stored) } })
      .catch(() => {})
  }, [jobId, initialSpec])

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
    setExpanded(copy.id)
  }

  async function save(): Promise<boolean> {
    if (!spec) return false
    setSaving(true)
    const res = await fetch(`/api/jobs/${jobId}/source/spec`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ spec }) })
    setSaving(false)
    if (!res.ok) { const j = await res.json().catch(() => ({})); toast.error(j.error ?? 'Could not save'); return false }
    const { data } = await res.json()
    setSpec(data.spec); setStored(true); setDirty(false)
    return true
  }
  async function reset() {
    const res = await fetch(`/api/jobs/${jobId}/source/spec`, { method: 'DELETE' })
    if (!res.ok) { toast.error('Could not reset'); return }
    const { data } = await res.json()
    setSpec(data.spec); setStored(false); setDirty(false); setCounts({})
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
    setCounts(next)
  }
  async function find() {
    if (dirty && !(await save())) return
    onFind?.()
  }

  if (!spec) return null
  // Counts and run stats are keyed by compiled lane key ("L<n>:…"); match on the level's position.
  const byIndex = (map: Record<string, { total: number | null; error?: string | null }>, i: number) => Object.entries(map).find(([k]) => k.startsWith(`L${i + 1}:`))?.[1]
  const runByIndex = (i: number) => (lastRun ?? []).find((r) => r.key.startsWith(`L${i + 1}:`))

  return (
    <section className="mt-3 rounded-xl border border-slate-200 bg-white">
      {/* header: one-line summary + actions; the rows open on click */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
        <button type="button" onClick={() => setOpen((v) => !v)} className="flex min-w-0 items-center gap-2 text-left text-xs" title="Who gets acquired, in order. Click to edit.">
          {open ? <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-400" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-400" />}
          <span className="font-semibold text-slate-700">Search plan</span>
          <span className="truncate text-slate-500">
            {spec.levels.length} levels
            {spec.levels[0] && <> · first: <span className="text-slate-700">{spec.levels[0].label}</span></>}
            {(() => { const c = byIndex(counts, 0); return c?.total != null ? <> · {c.total.toLocaleString()} people in L1</> : null })()}
            {(() => { const r = runByIndex(0); return r?.fetched ? <> · +{r.fetched} last run</> : null })()}
            {stored ? ' · edited' : ''}{dirty ? ' · unsaved' : ''}
          </span>
        </button>
        {!readOnly && (
          <div className="flex items-center gap-1.5">
            <Button size="sm" variant="ghost" onClick={count} loading={counting} title="How many people each level reaches, before anyone is acquired"><Calculator className="h-3.5 w-3.5" /> Count</Button>
            {stored && <Button size="sm" variant="ghost" onClick={reset} title="Back to the plan the ICP proposed"><RotateCcw className="h-3.5 w-3.5" /></Button>}
            {dirty && <Button size="sm" variant="outline" onClick={save} loading={saving}><Save className="h-3.5 w-3.5" /> Save</Button>}
            {onFind && <Button size="sm" onClick={find} loading={finding} title="Acquire people, level 1 first"><Radar className="h-3.5 w-3.5" /> Find people</Button>}
          </div>
        )}
      </div>

      {open && (<>
      {/* must-have line */}
      <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 px-3 py-2">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-rose-500" title="Applied to every level, never relaxed">Everyone</span>
        {spec.base.map((c, i) => (
          <Chips key={c.id} c={c} onChange={(n) => { const base = spec.base.slice(); base[i] = n; update({ ...spec, base }) }} onRemove={() => update({ ...spec, base: spec.base.filter((_, k) => k !== i) })} />
        ))}
        <AddCriterion onAdd={(kind) => update({ ...spec, base: [...spec.base, { id: newId('c'), kind, values: [] }] })} />
      </div>

      {/* levels */}
      <ol className="divide-y divide-slate-100 border-t border-slate-100">
        {spec.levels.map((lvl, i) => {
          const cnt = byIndex(counts, i)
          const run = runByIndex(i)
          const isOpen = expanded === lvl.id
          return (
            <li key={lvl.id} className="px-3 py-1.5">
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setExpanded(isOpen ? null : lvl.id)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                  {isOpen ? <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-400" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-400" />}
                  <span className="shrink-0 rounded bg-indigo-100 px-1.5 py-0.5 text-[10px] font-bold text-indigo-800">L{i + 1}</span>
                  <span className="shrink-0 text-xs font-medium text-slate-800" title={lvl.relaxes ? `Relaxes: ${lvl.relaxes}` : undefined}>{lvl.label}</span>
                  {!isOpen && <span className="hidden min-w-0 md:block"><Summary criteria={lvl.criteria} /></span>}
                </button>
                <div className="flex shrink-0 items-center gap-1.5 text-[11px]">
                  {run && (run.fetched > 0 || run.exhausted) && (
                    <span className={`rounded px-1.5 py-0.5 ${run.exhausted ? 'bg-slate-100 text-slate-500' : 'bg-emerald-50 text-emerald-700'}`} title="Last run">
                      {run.fetched > 0 ? `+${run.fetched}` : ''}{run.exhausted ? ' done' : ''}
                    </span>
                  )}
                  {cnt && <span className="rounded bg-slate-100 px-1.5 py-0.5 font-medium text-slate-700" title="People this level reaches">{cnt.error ? '—' : cnt.total != null ? cnt.total.toLocaleString() : '—'}</span>}
                  {isOpen && (
                    <>
                      <button type="button" aria-label="Move up" onClick={() => moveLevel(i, -1)} className="text-slate-300 hover:text-slate-600"><ArrowUp className="h-3.5 w-3.5" /></button>
                      <button type="button" aria-label="Move down" onClick={() => moveLevel(i, 1)} className="text-slate-300 hover:text-slate-600"><ArrowDown className="h-3.5 w-3.5" /></button>
                      <button type="button" aria-label="Delete level" onClick={() => update({ ...spec, levels: spec.levels.filter((_, k) => k !== i) })} className="text-slate-300 hover:text-rose-500"><Trash2 className="h-3.5 w-3.5" /></button>
                    </>
                  )}
                </div>
              </div>
              {isOpen && (
                <div className="ml-7 mt-1.5 space-y-1 pb-1">
                  <input value={lvl.label} onChange={(e) => setLevel(i, { ...lvl, label: e.target.value })} className="w-80 rounded border border-slate-200 px-1.5 py-0.5 text-xs text-slate-800 focus:border-indigo-300 focus:outline-none" />
                  {lvl.criteria.map((c, k) => (
                    <Chips key={c.id} c={c} onChange={(n) => { const criteria = lvl.criteria.slice(); criteria[k] = n; setLevel(i, { ...lvl, criteria }) }} onRemove={() => setLevel(i, { ...lvl, criteria: lvl.criteria.filter((_, x) => x !== k) })} />
                  ))}
                  <AddCriterion onAdd={(kind) => setLevel(i, { ...lvl, criteria: [...lvl.criteria, { id: newId('c'), kind, values: [] }] })} />
                </div>
              )}
            </li>
          )
        })}
      </ol>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-3 py-1.5 text-[11px]">
        <button type="button" onClick={addLevel} className="inline-flex items-center gap-1 text-indigo-600 hover:text-indigo-800"><Plus className="h-3 w-3" /> level</button>
        {spec.post_fetch.length > 0 && (
          <button type="button" onClick={() => setShowPostFetch((v) => !v)} className="text-slate-400 hover:text-slate-600">
            {spec.post_fetch.length} checks after fetch {showPostFetch ? '▾' : '▸'}
          </button>
        )}
      </div>
      {showPostFetch && (
        <ul className="border-t border-slate-100 px-3 py-1.5 text-[11px] text-slate-500">
          {spec.post_fetch.map((p, i) => (
            <li key={i} title={p.note ?? undefined}><span className="mr-1 rounded bg-slate-100 px-1 text-[9px] font-semibold uppercase">{p.how === 'judge' ? 'AI' : p.how === 'screen' ? 'screen' : 'computed'}</span>{p.label}</li>
          ))}
        </ul>
      )}
      </>)}
    </section>
  )
}
