'use client'

import { useState } from 'react'
import {
  MapPin, Clock, Briefcase, Layers, Building2, BarChart3, GraduationCap,
  BookOpen, Ban, Check, X, Plus, Lock, MoveHorizontal, History, LogOut, Building,
  CalendarCheck, Wrench, Factory, Users, Landmark, Banknote, Tag,
} from 'lucide-react'
import type { SearchCriterion, CriterionKind } from '@/lib/types/search-spec'
import { CRITERION_KIND_LABEL } from '@/lib/types/search-spec'
import { criterionLabel } from '@/lib/icp-gates'
import { BrandIcon } from '@/components/ui/BrandIcon'
import { groupEmployerAliases } from '@/lib/employer-aliases'
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
/** One icon per field, so a greyed-out field still says what it is. */
const ICON: Record<CriterionKind, IconCmp> = {
  location: MapPin,
  years_band: Clock,
  grad_year_band: CalendarCheck,
  title_current: Briefcase,
  title_any: History,
  function: Layers,
  employer_current: Building2,
  employer_past: LogOut,
  employer_any: Building,
  skill: Wrench,
  seniority: BarChart3,
  school: GraduationCap,
  degree_field: BookOpen,
  industry: Factory,
  company_size: Users,
  company_type: Landmark,
  funding_stage: Banknote,
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
  // Fixed field order, so you always know where to look. Criteria we hold come first in
  // that order; every remaining field is still listed, unset — which is the whole point
  // of a record. Without them you cannot tell "no school requirement" from "forgot one".
  // Only the rows every bet shares (where · years · school…). A bet's companies and
  // titles are edited on its card above; they still count as set for the strip below.
  const shared = criteria.filter((c) => c.bet == null)
  const byKind = (k: CriterionKind) => shared.filter((c) => c.kind === k)
  const ordered = [
    ...ADDABLE.flatMap(byKind),
    ...shared.filter((c) => !ADDABLE.includes(c.kind)),
  ]
  const unset = ADDABLE.filter((k) => !criteria.some((c) => c.kind === k))
  const row = (c: SearchCriterion, heading?: string) => (
        <Row
          key={c.id}
          c={c}
          heading={heading}
          editing={c.id === editingId}
          onOpen={() => (c.id === editingId ? close() : setEditingId(c.id))}
        >
          {c.id === editingId && (
            <CriterionEditor
              key={c.id}
              c={c}
              options={options}
              onCancel={close}
              onRemove={onRemove && (() => { onRemove(c.id); setEditingId(null) })}
              onSave={(next) => {
                if (isEmpty(next)) onRemove?.(next.id)
                else onChange(next)
                setEditingId(null)
              }}
            />
          )}
        </Row>
  )

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      {ordered.map((c) => row(c))}

      {/* Fields nobody set: one grey strip of icon chips, click to add. Twelve "Not
          set" rows buried five set ones; the strip still answers "have I missed
          anything" in one line. */}
      {onAdd && unset.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 border-t border-slate-100 bg-slate-50/60 px-4 py-2.5">
          <span className="mr-1 text-[10px] text-slate-400">Not used:</span>
          {unset.map((k) => {
            const Icon = ICON[k] ?? Tag
            return (
              <button
                key={k}
                type="button"
                onClick={() => add(k)}
                title={`Add ${CRITERION_KIND_LABEL[k].toLowerCase()}`}
                className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] text-slate-400 ring-1 ring-slate-200 hover:bg-white hover:text-slate-700"
              >
                <Icon className="h-3 w-3" />{CRITERION_KIND_LABEL[k]}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

/**
 * One field of the record: label on the left, value on the right, and what happens to it
 * when the search widens. Clicking anywhere on the row opens its editor underneath.
 */
function Row({
  c, heading, editing, onOpen, children, tag,
}: {
  c: SearchCriterion
  /** Overrides the kind label — a bet's rows read "Companies" / "As titles". */
  heading?: string
  editing: boolean
  onOpen: () => void
  children?: React.ReactNode
  /** Shown on the right instead of when the row widens (a bet's own row). */
  tag?: React.ReactNode
}) {
  const Icon = c.exclude ? Ban : ICON[c.kind] ?? Tag
  const never = c.relax_at == null
  const t = c.exclude ? { pill: '', icon: 'text-slate-400' } : tone(c.kind)
  // One chip per firm: "Boston Consulting Group" and "BCG" are two search terms, one company.
  const logos = isEmployer(c.kind) && !c.exclude ? groupEmployerAliases(c.values) : []

  return (
    <div className={`border-t border-slate-100 first:border-t-0 ${editing ? 'bg-slate-50/70' : ''}`}>
      <button
        type="button"
        onClick={onOpen}
        aria-expanded={editing}
        className="flex w-full flex-wrap items-start gap-x-3 gap-y-1 px-4 py-2.5 text-left hover:bg-slate-50 sm:flex-nowrap"
      >
        <span className="flex w-full shrink-0 items-center sm:w-[9.5rem] gap-1.5 pt-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
          <Icon className={`h-3.5 w-3.5 shrink-0 ${t.icon}`} />
          <span className="truncate">{heading ?? tileHeading(c)}</span>
        </span>

        <span className="min-w-0 flex-1 text-[13px] text-slate-800">
          {logos.length > 0 ? (
            <span className="flex flex-wrap items-center gap-1.5">
              {logos.slice(0, 6).map((g) => (
                <span key={g.display} className="inline-flex items-center gap-1">
                  <BrandIcon name={g.members[0]} size={16} />
                  <span>{g.display}</span>
                </span>
              ))}
              {logos.length > 6 && <span className="text-slate-400">+{logos.length - 6}</span>}
            </span>
          ) : (
            <span className={c.exclude ? 'text-slate-500 line-through decoration-slate-300' : ''}>
              {shortValue(c) || <span className="italic text-slate-400">Empty</span>}
            </span>
          )}
        </span>

        {tag}
        {/* A bet's rows say when they are searched in the bet's header instead. */}
        {!tag && !c.exclude && c.bet == null && (
          <span className="flex shrink-0 items-center gap-1 pt-0.5 text-[10px] text-slate-400">
            {never
              ? <><Lock className="h-3 w-3" /> never relaxed</>
              : <><MoveHorizontal className="h-3 w-3" /> widens at {c.relax_at}</>}
          </span>
        )}
      </button>

      {children && <div className="border-t border-slate-100 px-4 pb-3 pt-3">{children}</div>}
    </div>
  )
}

/**
 * ONE BET'S IDEAL PROFILE, under its card: every shared row (where · years · school…)
 * as this bet sees it — the bet's own version where it has one. Editing a row asks
 * whether the change is for this bet only or for every bet; a row that differs from
 * the other bets says so and can go back to the shared value. The bet's companies and
 * titles are its card's At / As lines, so they are not repeated here.
 */
export function BetProfile({
  criteria, bet, onSave, onRemove, options,
}: {
  /** This bet's rows, already resolved (betProfile): shared rows or its overrides. */
  criteria: SearchCriterion[]
  bet: number
  onSave: (next: SearchCriterion, allBets: boolean) => void
  onRemove: (c: SearchCriterion) => void
  options?: FetchedOptions
}) {
  const [editingId, setEditingId] = useState<string | null>(null)
  // A line being added lives here until it is saved, so a cancelled add leaves nothing.
  const [adding, setAdding] = useState<SearchCriterion | null>(null)
  const [picking, setPicking] = useState(false)
  const ordered = [
    ...ADDABLE.flatMap((k) => criteria.filter((c) => c.kind === k)),
    ...criteria.filter((c) => !ADDABLE.includes(c.kind)),
  ]
  // A bet's companies and titles are its card lines, never a profile row here.
  const unset = ADDABLE.filter((k) => !isEmployer(k) && !k.startsWith('title_') && !criteria.some((c) => c.kind === k))
  const own = (c: SearchCriterion) => c.bet === bet

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      {ordered.length === 0 && !adding && (
        <p className="px-4 py-2.5 text-xs text-slate-400">No lines yet — add where, how senior, which schools…</p>
      )}
      {ordered.map((c) => (
        <Row
          key={c.id}
          c={c}
          editing={c.id === editingId}
          onOpen={() => { setAdding(null); setEditingId(c.id === editingId ? null : c.id) }}
          tag={own(c) ? (
            <span className="shrink-0 rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 ring-1 ring-amber-100" title="This bet has its own value here; the other bets use the shared one.">
              only this bet
            </span>
          ) : undefined}
        >
          {c.id === editingId && (
            <CriterionEditor
              key={c.id}
              c={c}
              options={options}
              scope={{ betLabel: 'this bet', allBets: false }}
              onCancel={() => setEditingId(null)}
              // An override goes back to the shared value; a shared row goes everywhere.
              removeLabel={own(c) ? 'Use the same as the other bets' : 'Remove from every bet'}
              onRemove={() => { onRemove(c); setEditingId(null) }}
              onSave={(next, o) => {
                if (isEmpty(next)) onRemove(c)
                else onSave(next, o?.allBets ?? false)
                setEditingId(null)
              }}
            />
          )}
        </Row>
      ))}
      {adding && (
        <Row c={adding} editing onOpen={() => setAdding(null)}>
          <CriterionEditor
            key={adding.id}
            c={adding}
            options={options}
            scope={{ betLabel: 'this bet', allBets: false }}
            onCancel={() => setAdding(null)}
            onSave={(next, o) => {
              if (!isEmpty(next)) onSave(next, o?.allBets ?? false)
              setAdding(null)
            }}
          />
        </Row>
      )}
      {unset.length > 0 && !adding && (
        <div className="flex flex-wrap items-center gap-1.5 border-t border-slate-100 bg-slate-50/60 px-4 py-2">
          {!picking ? (
            <button type="button" onClick={() => setPicking(true)} className="inline-flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-800">
              <Plus className="h-3 w-3" /> Add a line
            </button>
          ) : (
            <>
              {unset.map((k) => {
                const Icon = ICON[k] ?? Tag
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => {
                      setEditingId(null)
                      setPicking(false)
                      setAdding({ id: `mh-${Date.now().toString(36)}-${++addSeq}`, kind: k, values: [], relax_at: null })
                    }}
                    className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] text-slate-500 ring-1 ring-slate-200 hover:bg-white hover:text-slate-800"
                  >
                    <Icon className="h-3 w-3" />{CRITERION_KIND_LABEL[k]}
                  </button>
                )
              })}
              <button type="button" onClick={() => setPicking(false)} className="text-[11px] text-slate-400 hover:text-slate-600">Cancel</button>
            </>
          )}
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


// ── Inline editors ─────────────────────────────────────────────────────────────

export function CriterionEditor({ c, onCancel, onSave, onRemove, removeLabel, options, scope }: {
  c: SearchCriterion
  onCancel: () => void
  /** `allBets` is set only when `scope` is given: the recruiter's choice of where it applies. */
  onSave: (n: SearchCriterion, opts?: { allBets: boolean }) => void
  onRemove?: () => void
  removeLabel?: string
  options?: FetchedOptions
  /** Editing a row under one bet: ask whether the change is for that bet or every bet. */
  scope?: { betLabel: string; allBets: boolean }
}) {
  const [draft, setDraft] = useState<SearchCriterion>({ ...c, values: [...c.values] })
  const [allBets, setAllBets] = useState(scope?.allBets ?? false)
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
      {scope && (
        <div className="flex flex-wrap items-center gap-1 text-[11px]">
          <span className="mr-1 text-slate-400">Apply to</span>
          {[false, true].map((all) => (
            <button
              key={String(all)}
              type="button"
              onClick={() => setAllBets(all)}
              aria-pressed={allBets === all}
              className={`rounded-md px-2 py-0.5 ring-1 ${allBets === all ? 'bg-slate-900 text-white ring-slate-900' : 'text-slate-500 ring-slate-200 hover:bg-slate-50'}`}
            >
              {all ? 'Every bet' : `Only ${scope.betLabel}`}
            </button>
          ))}
        </div>
      )}
      <div className="flex items-center justify-end gap-1.5 pt-1">
        {onRemove && (
          <button type="button" onClick={onRemove} className="mr-auto text-[11px] text-slate-400 hover:text-red-500">
            {removeLabel ?? 'Remove this must-have'}
          </button>
        )}
        <button type="button" onClick={onCancel} className="grid h-7 w-7 place-items-center rounded-md border border-slate-200 text-slate-400 hover:bg-slate-50" aria-label="Cancel" title="Cancel">
          <X className="h-3.5 w-3.5" />
        </button>
        <button type="button" onClick={() => onSave(draft, scope ? { allBets } : undefined)} className="grid h-7 w-7 place-items-center rounded-md bg-emerald-600 text-white hover:bg-emerald-700" aria-label="Save" title="Save">
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
