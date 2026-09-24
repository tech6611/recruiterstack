'use client'

import { useState } from 'react'
import {
  MapPin, Clock, Briefcase, Layers, Building2, Tag, BarChart3, GraduationCap,
  BookOpen, Ban, Pencil, Check, X, Plus, DollarSign,
} from 'lucide-react'
import type { SearchCriterion, CriterionKind } from '@/lib/types/search-spec'
import { CRITERION_KIND_LABEL } from '@/lib/types/search-spec'
import { criterionLabel } from '@/lib/icp-gates'
import { CompanyLogo } from '@/components/req-jobs/CompanyLogo'

/**
 * The "Ideal profile" as an editable tile grid (Option B). Each dimension is a card
 * with a per-kind icon, a relax tag, a pencil to edit inline, and — for employers —
 * fetched company logos. Colours are the platform's pine / sand / gold. Editing a
 * tile writes back the whole criterion via onChange; the parent (IcpEditor) rebuilds
 * the must-have from it, so the ICP's single source of truth stays consistent.
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

export function IdealProfileTiles({
  criteria,
  onChange,
}: {
  criteria: SearchCriterion[]
  onChange: (next: SearchCriterion) => void
}) {
  const [editingId, setEditingId] = useState<string | null>(null)
  return (
    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
      {criteria.map((c) => (
        <Tile
          key={c.id}
          c={c}
          editing={editingId === c.id}
          onEdit={() => setEditingId(c.id)}
          onClose={() => setEditingId(null)}
          onChange={(next) => {
            onChange(next)
            setEditingId(null)
          }}
        />
      ))}
    </div>
  )
}

function Tile({
  c, editing, onEdit, onClose, onChange,
}: {
  c: SearchCriterion
  editing: boolean
  onEdit: () => void
  onClose: () => void
  onChange: (next: SearchCriterion) => void
}) {
  const Icon = c.exclude ? Ban : ICON[c.kind] ?? Tag
  const never = c.relax_at == null
  const tone = c.exclude
    ? 'bg-slate-100 text-slate-400 border-slate-200'
    : never
      ? 'bg-gold-50 text-gold-600 border-gold-200'
      : 'bg-emerald-50 text-emerald-600 border-emerald-100'

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-2">
          <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg border ${tone}`}>
            <Icon className="h-4 w-4" />
          </span>
          <span className="truncate text-[10px] font-semibold uppercase tracking-wide text-slate-400">{tileHeading(c)}</span>
        </span>
        <span className="flex shrink-0 items-center gap-1.5">
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${never ? 'border border-emerald-100 bg-emerald-50 text-emerald-700' : 'border border-slate-200 bg-slate-100 text-slate-500'}`}
          >
            {never ? 'never relaxed' : `relaxes at L${c.relax_at}`}
          </span>
          {!editing && (
            <button
              type="button"
              onClick={onEdit}
              title="Edit"
              aria-label="Edit"
              className="grid h-6 w-6 place-items-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            >
              <Pencil className="h-3 w-3" />
            </button>
          )}
        </span>
      </div>

      {editing ? (
        <CriterionEditor c={c} onCancel={onClose} onSave={onChange} />
      ) : (
        <Display c={c} />
      )}
    </div>
  )
}

function Display({ c }: { c: SearchCriterion }) {
  if (isEmployer(c.kind) && c.values.length) {
    return (
      <div className="flex flex-wrap gap-1.5">
        {c.values.map((v) => (
          <span key={v} className="inline-flex items-center gap-1.5 rounded-md bg-slate-50 px-1.5 py-1 text-[12px] text-slate-700">
            <CompanyLogo name={v} />
            {v}
          </span>
        ))}
      </div>
    )
  }
  return <div className="text-[13px] font-medium text-slate-800">{criterionLabel(c)}</div>
}

// ── Inline editors ─────────────────────────────────────────────────────────────

function CriterionEditor({ c, onCancel, onSave }: { c: SearchCriterion; onCancel: () => void; onSave: (n: SearchCriterion) => void }) {
  const [draft, setDraft] = useState<SearchCriterion>({ ...c, values: [...c.values] })
  return (
    <div className="space-y-2">
      {isBand(draft.kind) ? (
        <BandFields draft={draft} setDraft={setDraft} />
      ) : draft.kind === 'location' ? (
        <LocationFields draft={draft} setDraft={setDraft} />
      ) : (
        <ChipField draft={draft} setDraft={setDraft} withLogos={isEmployer(draft.kind)} />
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
  return (
    <div className="flex items-center gap-2 text-[13px]">
      <input
        type="number" min={0} value={draft.min ?? ''} placeholder="min"
        onChange={(e) => setDraft({ ...draft, min: numOrNull(e.target.value) })}
        className="w-20 rounded-md border border-slate-200 px-2 py-1 focus:border-emerald-400 focus:outline-none"
      />
      <span className="text-slate-400">to</span>
      <input
        type="number" min={0} value={draft.max ?? ''} placeholder="max"
        onChange={(e) => setDraft({ ...draft, max: numOrNull(e.target.value) })}
        className="w-20 rounded-md border border-slate-200 px-2 py-1 focus:border-emerald-400 focus:outline-none"
      />
      <span className="text-slate-400">{draft.kind === 'years_band' ? 'years' : ''}</span>
    </div>
  )
}

function LocationFields({ draft, setDraft }: { draft: SearchCriterion; setDraft: (n: SearchCriterion) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-[13px]">
      <input
        value={draft.values[0] ?? ''} placeholder="City, Country"
        onChange={(e) => setDraft({ ...draft, values: [e.target.value] })}
        className="min-w-[10rem] flex-1 rounded-md border border-slate-200 px-2 py-1 focus:border-emerald-400 focus:outline-none"
      />
      <input
        type="number" min={1} max={2000} value={draft.radius_km ?? 50}
        onChange={(e) => setDraft({ ...draft, radius_km: numOrNull(e.target.value) ?? 50 })}
        className="w-20 rounded-md border border-slate-200 px-2 py-1 focus:border-emerald-400 focus:outline-none"
      />
      <span className="text-slate-400">km</span>
    </div>
  )
}

function ChipField({ draft, setDraft, withLogos }: { draft: SearchCriterion; setDraft: (n: SearchCriterion) => void; withLogos: boolean }) {
  const [entry, setEntry] = useState('')
  const add = () => {
    const v = entry.trim()
    if (v && !draft.values.some((x) => x.toLowerCase() === v.toLowerCase())) {
      setDraft({ ...draft, values: [...draft.values, v] })
    }
    setEntry('')
  }
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {draft.values.map((v) => (
        <span key={v} className="inline-flex items-center gap-1.5 rounded-md bg-slate-100 px-1.5 py-1 text-[12px] text-slate-700">
          {withLogos && <CompanyLogo name={v} />}
          {v}
          <button type="button" aria-label={`Remove ${v}`} onClick={() => setDraft({ ...draft, values: draft.values.filter((x) => x !== v) })} className="text-slate-400 hover:text-red-500">
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
      <span className="inline-flex items-center gap-1">
        <input
          value={entry}
          onChange={(e) => setEntry(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add() } }}
          onBlur={add}
          placeholder="Add…"
          className="w-24 rounded-md border border-dashed border-slate-300 px-2 py-1 text-[12px] focus:w-40 focus:border-emerald-400 focus:outline-none"
        />
        <button type="button" onClick={add} aria-label="Add" className="grid h-6 w-6 place-items-center rounded-md text-slate-400 hover:bg-slate-100"><Plus className="h-3.5 w-3.5" /></button>
      </span>
    </div>
  )
}
