'use client'

import { useState } from 'react'
import {
  MapPin, Clock, Briefcase, Layers, Building2, Tag, BarChart3, GraduationCap,
  BookOpen, Ban, Check, X, Plus, DollarSign, Lock, MoveHorizontal,
} from 'lucide-react'
import type { SearchCriterion, CriterionKind } from '@/lib/types/search-spec'
import { CRITERION_KIND_LABEL } from '@/lib/types/search-spec'
import { criterionLabel } from '@/lib/icp-gates'
import { BrandIcon } from '@/components/ui/BrandIcon'
import { SuggestInput } from '@/components/ui/SuggestInput'
import { useIcpOptions } from '@/lib/hooks/useIcpOptions'
import { RADIUS_KM, YEARS_BANDS, bandLabel, optionsFor, type FetchedOptions } from '@/lib/icp-options'

/**
 * The "Ideal profile" as one strip of coloured pills (option P1). Each must-have is a
 * pill: a per-kind icon and colour, the value (company logos for employers), and a
 * lock (never relaxed) or ↔ (widens at a broader search level). Clicking a pill opens
 * its editor below the strip. Editing writes back the whole criterion via onChange;
 * the parent (IcpEditor) rebuilds the must-have from it, so the ICP's single source of
 * truth stays consistent.
 */

type IconCmp = typeof MapPin
const ICON: Record<CriterionKind, IconCmp> = {
  location: MapPin,
  years_band: Clock,
  grad_year_band: GraduationCap,
  title_current: Briefcase,
  title_any: Briefcase,
  function: Layers,
  employer_current: Building2,
  employer_past: Building2,
  employer_any: Building2,
  skill: Tag,
  seniority: BarChart3,
  school: GraduationCap,
  degree_field: BookOpen,
  industry: Layers,
  company_size: BarChart3,
  company_type: Building2,
  funding_stage: DollarSign,
}

const isEmployer = (k: CriterionKind) => k.startsWith('employer_')
const isBand = (k: CriterionKind) => k === 'years_band' || k === 'grad_year_band'

/** A friendlier tile heading than the raw kind label. */
function tileHeading(c: SearchCriterion): string {
  if (c.exclude && c.kind.startsWith('title_')) return 'Exclude titles'
  if (c.exclude && isEmployer(c.kind)) return 'Exclude employers'
  return CRITERION_KIND_LABEL[c.kind]
}

/** Kinds a recruiter can add as a new must-have (the Search plan's "Everyone" line used
 *  to be the only place to add one; the tiles are now the one editor). */
const ADDABLE: CriterionKind[] = ['location', 'years_band', 'title_current', 'title_any', 'employer_current', 'employer_past', 'employer_any', 'school', 'degree_field', 'grad_year_band', 'seniority', 'function', 'skill', 'industry', 'company_size', 'company_type', 'funding_stage']
/** Kinds whose tile can flip to "exclude these". */
const EXCLUDABLE = (k: CriterionKind) => !isBand(k) && k !== 'location'
const isEmpty = (c: SearchCriterion) => c.values.every((v) => !v.trim()) && c.min == null && c.max == null

let addSeq = 0

export function IdealProfileTiles({
  criteria,
  onChange,
  onAdd,
  onRemove,
  options,
}: {
  criteria: SearchCriterion[]
  onChange: (next: SearchCriterion) => void
  /** Add a new (never-relaxed) must-have; omitted = no add control. */
  onAdd?: (c: SearchCriterion) => void
  onRemove?: (id: string) => void
  /** Suggestion lists, for the dev fixture. Omitted = fetched from /api/icp/options. */
  options?: FetchedOptions
}) {
  const [editingId, setEditingId] = useState<string | null>(null)
  function add(kind: CriterionKind) {
    const c: SearchCriterion = { id: `mh-${Date.now().toString(36)}-${++addSeq}`, kind, values: [], relax_at: null }
    onAdd?.(c)
    setEditingId(c.id)
  }
  const editing = criteria.find((c) => c.id === editingId) ?? null
  // A just-added pill left empty is dropped rather than saved as a blank filter.
  const close = () => { if (editing && isEmpty(editing)) onRemove?.(editing.id); setEditingId(null) }
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {criteria.map((c) => (
          <Pill key={c.id} c={c} active={c.id === editingId} onClick={() => (c.id === editingId ? close() : setEditingId(c.id))} />
        ))}
        {onAdd && (
          <select id="icp-add-must-have" value="" onChange={(e) => { if (e.target.value) add(e.target.value as CriterionKind) }}
            className="h-8 rounded-full border border-dashed border-slate-300 bg-white px-3 text-xs text-slate-500 hover:border-emerald-300">
            <option value="">+ Add</option>
            {/* One location per role: a second would be ANDed (nobody passes) and the job-location sync keeps only one. */}
            {ADDABLE.filter((k) => k !== 'location' || !criteria.some((c) => c.kind === 'location')).map((k) => <option key={k} value={k}>{CRITERION_KIND_LABEL[k]}</option>)}
          </select>
        )}
      </div>
      {editing && (
        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{tileHeading(editing)}</span>
            {onRemove && (
              <button type="button" onClick={() => { onRemove(editing.id); setEditingId(null) }}
                className="text-[11px] text-slate-400 hover:text-red-500">Remove this must-have</button>
            )}
          </div>
          <CriterionEditor
            key={editing.id}
            c={editing}
            options={options}
            onCancel={close}
            onSave={(next) => {
              if (isEmpty(next)) onRemove?.(next.id)
              else onChange(next)
              setEditingId(null)
            }}
          />
        </div>
      )}
    </div>
  )
}

/** One colour per kind of must-have, so the strip reads at a glance. */
function tone(k: CriterionKind): { pill: string; icon: string } {
  if (k === 'location') return { pill: 'bg-rose-50 text-rose-900 ring-rose-100', icon: 'text-rose-500' }
  if (isBand(k)) return { pill: 'bg-amber-50 text-amber-900 ring-amber-100', icon: 'text-amber-500' }
  if (k.startsWith('title_')) return { pill: 'bg-sky-50 text-sky-900 ring-sky-100', icon: 'text-sky-500' }
  if (isEmployer(k)) return { pill: 'bg-emerald-50 text-emerald-900 ring-emerald-100', icon: 'text-emerald-600' }
  if (k === 'skill') return { pill: 'bg-violet-50 text-violet-900 ring-violet-100', icon: 'text-violet-500' }
  if (k === 'school' || k === 'degree_field') return { pill: 'bg-indigo-50 text-indigo-900 ring-indigo-100', icon: 'text-indigo-500' }
  return { pill: 'bg-teal-50 text-teal-900 ring-teal-100', icon: 'text-teal-600' }
}

/** The value, short — the icon and colour already say which kind it is. */
function shortValue(c: SearchCriterion): string {
  if (c.kind === 'years_band') return criterionLabel(c).replace(' years', ' yrs')
  if (c.kind === 'grad_year_band') return criterionLabel(c)
  if (c.kind === 'location') return `${c.values[0] ?? '?'} · ${c.radius_km ?? 50} km`
  const vals = c.values.filter((v) => v.trim())
  return vals.slice(0, 3).join(' · ') + (vals.length > 3 ? ` +${vals.length - 3}` : '')
}

function Pill({ c, active, onClick }: { c: SearchCriterion; active: boolean; onClick: () => void }) {
  const Icon = c.exclude ? Ban : ICON[c.kind] ?? Tag
  const never = c.relax_at == null
  const t = c.exclude ? { pill: 'bg-slate-100 text-slate-500 ring-slate-200', icon: 'text-slate-400' } : tone(c.kind)
  const logos = isEmployer(c.kind) && !c.exclude ? c.values.filter((v) => v.trim()) : []
  const title = `${tileHeading(c)}: ${c.values.join(', ') || criterionLabel(c)} — ${never ? 'never relaxed' : `widens at search level ${c.relax_at}`}. Click to edit.`
  return (
    <button type="button" onClick={onClick} title={title}
      className={`inline-flex max-w-full items-center gap-1.5 rounded-full py-1.5 pl-2 pr-3 text-[13px] ring-1 transition ${t.pill} ${active ? 'ring-2 ring-emerald-500' : 'hover:brightness-95'}`}>
      <Icon className={`h-4 w-4 shrink-0 ${t.icon}`} />
      {logos.length > 0 ? (
        <span className="flex items-center gap-1">
          <span className="flex -space-x-1">
            {logos.slice(0, 4).map((v) => <span key={v} className="rounded ring-2 ring-white"><BrandIcon name={v} /></span>)}
          </span>
          {logos.length > 4 && <span className="text-xs">+{logos.length - 4}</span>}
        </span>
      ) : (
        <span className={`truncate ${c.exclude ? 'line-through decoration-slate-400' : ''}`}>{shortValue(c) || 'Empty'}</span>
      )}
      {!c.exclude && (never
        ? <Lock className={`h-3 w-3 shrink-0 ${t.icon}`} />
        : <MoveHorizontal className={`h-3 w-3 shrink-0 ${t.icon}`} />)}
    </button>
  )
}

// ── Inline editors ─────────────────────────────────────────────────────────────

function CriterionEditor({ c, onCancel, onSave, options }: { c: SearchCriterion; onCancel: () => void; onSave: (n: SearchCriterion) => void; options?: FetchedOptions }) {
  const [draft, setDraft] = useState<SearchCriterion>({ ...c, values: [...c.values] })
  // One fetch per page, shared by every pill's editor. `options` overrides it so the
  // dev fixture can show real pickers without an authenticated request.
  const live = useIcpOptions()
  const suggestions = optionsFor(draft.kind, options ?? live)
  return (
    <div className="space-y-2">
      {isBand(draft.kind) ? (
        <BandFields draft={draft} setDraft={setDraft} />
      ) : draft.kind === 'location' ? (
        <LocationFields draft={draft} setDraft={setDraft} cities={suggestions} />
      ) : (
        <ChipField draft={draft} setDraft={setDraft} withLogos={isEmployer(draft.kind)} options={suggestions} />
      )}
      {EXCLUDABLE(draft.kind) && (
        <label className="flex items-center gap-1.5 text-[11px] text-slate-500">
          <input type="checkbox" checked={!!draft.exclude} onChange={(e) => setDraft({ ...draft, exclude: e.target.checked })} className="h-3.5 w-3.5" />
          Exclude these instead (candidates must NOT match)
        </label>
      )}
      <div className="flex items-center justify-end gap-1.5 pt-1">
        <button type="button" onClick={onCancel} className="grid h-7 w-7 place-items-center rounded-md border border-slate-200 text-slate-400 hover:bg-slate-50" aria-label="Cancel" title="Cancel">
          <X className="h-3.5 w-3.5" />
        </button>
        <button type="button" onClick={() => onSave(draft)} className="grid h-7 w-7 place-items-center rounded-md bg-emerald-600 text-white hover:bg-emerald-700" aria-label="Save" title="Save">
          <Check className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}

const numOrNull = (s: string): number | null => {
  const t = s.trim()
  if (!t) return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

function BandFields({ draft, setDraft }: { draft: SearchCriterion; setDraft: (n: SearchCriterion) => void }) {
  const chosen = bandLabel(draft.min, draft.max)
  const years = draft.kind === 'years_band'
  return (
    <div className="space-y-2">
      {years && (
        <div className="flex flex-wrap gap-1">
          {YEARS_BANDS.map((b) => (
            <button
              key={b.label}
              type="button"
              onClick={() => setDraft({ ...draft, min: b.min, max: b.max })}
              className={`rounded-md border px-2 py-1 text-[12px] transition-colors ${
                chosen === b.label
                  ? 'border-emerald-500 bg-emerald-50 font-medium text-emerald-800'
                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              {b.label}
            </button>
          ))}
        </div>
      )}
      {/* The bands cover what recruiters ask for; the numbers stay editable for the
          brief that asks for something else. */}
      <div className="flex items-center gap-2 text-[13px]">
        <input
          type="number" min={0} value={draft.min ?? ''} placeholder="min" aria-label="Minimum"
          onChange={(e) => setDraft({ ...draft, min: numOrNull(e.target.value) })}
          className="w-20 rounded-md border border-slate-200 px-2 py-1 focus:border-emerald-400 focus:outline-none"
        />
        <span className="text-slate-400">to</span>
        <input
          type="number" min={0} value={draft.max ?? ''} placeholder="any" aria-label="Maximum"
          onChange={(e) => setDraft({ ...draft, max: numOrNull(e.target.value) })}
          className="w-20 rounded-md border border-slate-200 px-2 py-1 focus:border-emerald-400 focus:outline-none"
        />
        <span className="text-slate-400">{years ? 'years' : ''}</span>
      </div>
    </div>
  )
}

function LocationFields({ draft, setDraft, cities }: { draft: SearchCriterion; setDraft: (n: SearchCriterion) => void; cities: string[] }) {
  const radius = draft.radius_km ?? 50
  return (
    <div className="space-y-2">
      <SuggestInput
        value={draft.values[0] ?? ''}
        onChange={(v) => setDraft({ ...draft, values: [v] })}
        options={cities}
        placeholder="City, region, country"
        ariaLabel="City"
        autoFocus
        className="max-w-md"
      />
      <div className="flex flex-wrap items-center gap-1.5 text-[13px]">
        <span className="text-slate-400">within</span>
        {RADIUS_KM.map((km) => (
          <button
            key={km}
            type="button"
            onClick={() => setDraft({ ...draft, radius_km: km })}
            className={`rounded-md border px-2 py-1 text-[12px] transition-colors ${
              radius === km
                ? 'border-emerald-500 bg-emerald-50 font-medium text-emerald-800'
                : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
            }`}
          >
            {km} km
          </button>
        ))}
        {/* Keyable, because a search radius is a number someone may want exactly. */}
        <input
          type="number" min={1} max={2000} value={radius} aria-label="Radius in kilometres"
          onChange={(e) => setDraft({ ...draft, radius_km: numOrNull(e.target.value) ?? 50 })}
          className="w-20 rounded-md border border-slate-200 px-2 py-1 focus:border-emerald-400 focus:outline-none"
        />
        <span className="text-slate-400">km</span>
      </div>
    </div>
  )
}

function ChipField({ draft, setDraft, withLogos, options }: { draft: SearchCriterion; setDraft: (n: SearchCriterion) => void; withLogos: boolean; options: string[] }) {
  const [entry, setEntry] = useState('')
  const add = (raw?: string) => {
    const v = (raw ?? entry).trim()
    if (v && !draft.values.some((x) => x.toLowerCase() === v.toLowerCase())) {
      setDraft({ ...draft, values: [...draft.values, v] })
    }
    setEntry('')
  }
  // Already-chosen values drop out of the list: offering someone a value they have
  // just added reads as a control that did nothing.
  const left = options.filter((o) => !draft.values.some((v) => v.toLowerCase() === o.toLowerCase()))
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {draft.values.map((v) => (
        <span key={v} className="inline-flex items-center gap-1.5 rounded-md bg-slate-100 px-1.5 py-1 text-[12px] text-slate-700">
          {withLogos && <BrandIcon name={v} />}
          {v}
          <button type="button" aria-label={`Remove ${v}`} onClick={() => setDraft({ ...draft, values: draft.values.filter((x) => x !== v) })} className="text-slate-400 hover:text-red-500">
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
      <span className="inline-flex items-center gap-1">
        <SuggestInput
          value={entry}
          onChange={setEntry}
          onCommit={(v) => add(v)}
          options={left}
          withLogos={withLogos}
          placeholder={left.length ? 'Search or type…' : 'Add…'}
          ariaLabel="Add a value"
          className="w-52"
        />
        <button type="button" onClick={() => add()} aria-label="Add" className="grid h-6 w-6 place-items-center rounded-md text-slate-400 hover:bg-slate-100"><Plus className="h-3.5 w-3.5" /></button>
      </span>
    </div>
  )
}
