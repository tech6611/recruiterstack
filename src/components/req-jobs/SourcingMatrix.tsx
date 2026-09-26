'use client'

/**
 * Sourcing comparison matrix — every candidate scored on the same axes: the
 * ICP's must-haves (pass/fail gates, ✓/✕) and its weighted competencies (a 1–4
 * rating bar). Click a name to expand the evidence behind the scores. Shared by
 * the internal (ATS) pocket; the market pocket adopts it next.
 */

import { Fragment, useState } from 'react'
import { ChevronRight, MapPin, Building2, ThumbsUp, ThumbsDown, FileQuestion, Star, EyeOff, Columns3, PanelRightOpen, Loader2 } from 'lucide-react'
import { fitBucketFor } from '@/lib/ai/fit-bucket'
import { isSourcingOnlyCriterion } from '@/lib/icp-gates'
import type { IcpMustHave } from '@/lib/types/icp'

export interface MatrixIcp {
  must_haves: Pick<IcpMustHave, 'id' | 'label' | 'attribute' | 'relax_at' | 'kind' | 'enforcement'>[]
  competencies: { id: string; name: string; weight: number }[]
}

export interface MatrixMatch {
  candidate_id: string
  score: number
  gate_failures: { label?: string }[]
  /** Gates the judge couldn't establish from the data on file — shown as "?", never a fail. */
  gate_unknown?: { label?: string }[]
  /** Small chip next to the name, e.g. "Crustdata · new". */
  source_badge?: string | null
  /** The ladder level that reached this person, e.g. "L1 · full match". */
  level_badge?: string | null
  /** One-glance labels derived from role history ("Ex-McKinsey", "Fast career growth"). */
  tags?: string[]
  /** Judge's reason per must-have label — shown when a gate cell is clicked. */
  gate_reasons?: Record<string, string>
  education_summary?: string | null
  experience_years?: number | null
  current_tenure_months?: number | null
  starred?: boolean
  hidden?: boolean
  /** Pool-recall profile outside the plan's location / years, with the reason. */
  outside_plan?: string | null
  /** Not scored yet — gate, competency and fit cells show a placeholder. */
  pending?: boolean
  red_flags: string[]
  rationale: string | null
  data_incomplete?: boolean | null
  /** Market pocket only — profile has no contact details on file. */
  unreachable?: boolean
  /** Shown as chips in the expanded row when present. */
  skills?: string[]
  competencies: { name: string; rating: number; evidence?: string }[]
  decision?: string | null
  candidate: {
    id: string
    name: string | null
    current_title: string | null
    current_company: string | null
    location: string | null
  } | null
}

const BUCKET: Record<string, string> = {
  great: 'text-emerald-600',
  good: 'text-sky-600',
  okay: 'text-amber-600',
  weak: 'text-rose-600',
}

// competency rating (1–4) → bar colour + tier label
const RATING: Record<number, { bar: string; cls: string; label: string }> = {
  4: { bar: 'bg-emerald-500', cls: 'bg-emerald-100 text-emerald-700', label: 'Strong' },
  3: { bar: 'bg-sky-500', cls: 'bg-sky-100 text-sky-700', label: 'Solid' },
  2: { bar: 'bg-amber-500', cls: 'bg-amber-100 text-amber-700', label: 'Partial' },
  1: { bar: 'bg-rose-500', cls: 'bg-rose-100 text-rose-700', label: 'Gap' },
}

type ExtraCol = 'years' | 'location' | 'tenure' | 'education'
const EXTRA_COLS: { key: ExtraCol; label: string }[] = [
  { key: 'years', label: 'Years' }, { key: 'location', label: 'Location' }, { key: 'tenure', label: 'Tenure' }, { key: 'education', label: 'Education' },
]
function extraValue(m: MatrixMatch, col: ExtraCol): string {
  if (col === 'years') return m.experience_years != null ? `${m.experience_years}` : '—'
  if (col === 'location') return m.candidate?.location ?? '—'
  if (col === 'tenure') return m.current_tenure_months != null ? (m.current_tenure_months >= 12 ? `${Math.round(m.current_tenure_months / 12 * 10) / 10}y` : `${m.current_tenure_months}mo`) : '—'
  return m.education_summary ?? '—'
}

function mustPass(m: MatrixMatch, label: string): boolean {
  return !m.gate_failures.some((g) => (g.label ?? '') === label)
}
function mustUnknown(m: MatrixMatch, label: string): boolean {
  return (m.gate_unknown ?? []).some((g) => (g.label ?? '') === label)
}
const GATE_CELL = {
  pass: 'bg-emerald-100 text-emerald-700',
  fail: 'bg-rose-100 text-rose-700',
  unknown: 'bg-amber-100 text-amber-700',
} as const
function gateState(m: MatrixMatch, label: string): keyof typeof GATE_CELL {
  if (!mustPass(m, label)) return 'fail'
  return mustUnknown(m, label) ? 'unknown' : 'pass'
}
const GATE_GLYPH: Record<keyof typeof GATE_CELL, string> = { pass: '✓', fail: '✕', unknown: '?' }
/** A compact column header from a long, often question-style ICP label. Drops the
 *  parenthetical aside, then strips leading filler ("Has a genuine…", "At least 1
 *  year of experience with…") so only the essential noun phrase remains. The full
 *  label stays in the header tooltip and the expanded row.
 *    "Has a genuine software-engineering background" → "Software-engineering background"
 *    "Has at least 1 year of experience with direct people management responsibilities"
 *      → "People management responsibilities"
 */
const LEADING_FILLER =
  /^(?:has|have|is|are|can|able to|willing to|must|should|the|a|an|at least|genuine|proven|demonstrated|strong|solid|prior|relevant|significant|hands[- ]?on|direct|some|of|with|in|for|and|experience|background|track record|\d+\+?\s*(?:years?|yrs?|months?|mos?|weeks?))\b[\s,]*/i
function shortLabel(label: string): string {
  const base = label.split('(')[0].replace(/[?.:;,]+\s*$/, '').trim()
  let s = base
  for (let prev = ''; s && s !== prev; ) { prev = s; s = s.replace(LEADING_FILLER, '') }
  if (!s) s = base
  return s.charAt(0).toUpperCase() + s.slice(1)
}
// Stored competencies carry the same name as the ICP competency; fall back to index.
function compFor(m: MatrixMatch, name: string, idx: number) {
  const key = name.toLowerCase().trim()
  return m.competencies?.find((c) => (c.name ?? '').toLowerCase().trim() === key) ?? m.competencies?.[idx]
}

/** Small popover under a cell: the judge's sentence for that gate or competency. */
function Evidence({ title, text, onClose }: { title: string; text: string; onClose: () => void }) {
  return (
    <div className="absolute left-1/2 top-full z-30 mt-1 w-64 -translate-x-1/2 rounded-md border border-slate-200 bg-white p-2 text-left shadow-lg" onClick={(e) => e.stopPropagation()}>
      <div className="mb-1 flex items-start justify-between gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{title}</span>
        <button type="button" onClick={onClose} className="text-slate-300 hover:text-slate-600" aria-label="Close">×</button>
      </div>
      <p className="text-[11px] leading-snug text-slate-700">{text}</p>
    </div>
  )
}

function RatingBar({ rating }: { rating: number }) {
  const r = RATING[rating]
  if (!r) return <span className="text-[11px] text-slate-300">—</span>
  return (
    <span className="inline-flex flex-col items-center gap-1">
      <span className="flex gap-0.5">
        {[1, 2, 3, 4].map((n) => (
          <span key={n} className={`h-3.5 w-1.5 rounded-sm ${n <= rating ? r.bar : 'bg-slate-200'}`} />
        ))}
      </span>
      <span className="text-[9px] text-slate-400">{rating}/4</span>
    </span>
  )
}

export function SourcingMatrix({
  matches,
  icp,
  selected,
  onToggle,
  onDecide,
  onStar,
  onHide,
  onOpenProfile,
}: {
  matches: MatrixMatch[]
  icp: MatrixIcp
  selected: Set<string>
  onToggle: (candidateId: string) => void
  /** Omit to hide the 👍/👎 column (e.g. the market pocket, which has no calibration decisions). */
  onDecide?: (candidateId: string, decision: 'yes' | 'no') => void
  /** Market pocket: star (shortlist without spending an unlock) / hide / open the profile panel. */
  onStar?: (candidateId: string, starred: boolean) => void
  onHide?: (candidateId: string) => void
  onOpenProfile?: (candidateId: string) => void
}) {
  const [open, setOpen] = useState<Set<string>>(new Set())
  // Click-to-evidence popover: which cell is open.
  const [pop, setPop] = useState<{ id: string; key: string } | null>(null)
  // Optional columns (Juicebox "table view"): remembered per browser.
  const [extra, setExtra] = useState<ExtraCol[]>(() => {
    try { const v = typeof window !== 'undefined' ? window.localStorage.getItem('sourcing-matrix-columns') : null; return v ? (JSON.parse(v) as ExtraCol[]) : [] } catch { return [] }
  })
  const [pickerOpen, setPickerOpen] = useState(false)
  const toggleExtra = (c: ExtraCol) => setExtra((prev) => { const next = prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]; try { window.localStorage.setItem('sourcing-matrix-columns', JSON.stringify(next)) } catch { /* ignore */ } return next })
  const toggleOpen = (id: string) =>
    setOpen((prev) => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })

  // Target-company lanes guide acquisition; presenting them as scorecard columns
  // falsely tells recruiters that everyone outside the target list is ineligible.
  const gates = icp.must_haves.filter((gate) => !isSourcingOnlyCriterion(gate))
  const cols = 1 + gates.length + icp.competencies.length + 1 + (onDecide ? 1 : 0) // name + musts + comps + fit (+ actions)

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200">
      <table className="w-full border-collapse text-slate-700">
        <thead>
          {/* group row — labels centered across each group */}
          <tr className="bg-slate-50 text-[8px] font-bold uppercase tracking-wide text-slate-400">
            <th className="sticky left-0 z-10 bg-slate-50" aria-hidden />
            {extra.length > 0 && <th colSpan={extra.length} aria-hidden />}
            {gates.length > 0 && (
              <th colSpan={gates.length} className="border-l-2 border-slate-200 px-2 pt-2 text-center">Must-have</th>
            )}
            {icp.competencies.length > 0 && (
              <th colSpan={icp.competencies.length} className="border-l-2 border-slate-200 px-2 pt-2 text-center">Competency</th>
            )}
            <th className="border-l-2 border-slate-200" aria-hidden />
            {onDecide && <th aria-hidden />}
          </tr>
          {/* column row */}
          <tr className="bg-slate-50 align-bottom text-slate-500">
            <th className="sticky left-0 z-10 bg-slate-50 px-3 pb-2 text-left text-[11px] font-semibold">
              <div className="relative flex items-center gap-2">
                Candidate
                <button type="button" onClick={() => setPickerOpen((v) => !v)} title="Choose columns" className="inline-flex items-center gap-1 rounded px-1 py-0.5 text-[10px] font-medium text-slate-400 hover:bg-slate-100 hover:text-slate-600"><Columns3 className="h-3 w-3" /> columns</button>
                {pickerOpen && (
                  <div className="absolute left-0 top-6 z-20 w-40 rounded-md border border-slate-200 bg-white p-2 text-[11px] font-normal shadow-md">
                    {EXTRA_COLS.map((c) => (
                      <label key={c.key} className="flex items-center gap-2 py-0.5 text-slate-700"><input type="checkbox" checked={extra.includes(c.key)} onChange={() => toggleExtra(c.key)} className="h-3 w-3 accent-slate-700" /> {c.label}</label>
                    ))}
                  </div>
                )}
              </div>
            </th>
            {extra.map((col) => <th key={col} className="px-2 pb-2 text-left text-[10px] font-medium text-slate-500">{EXTRA_COLS.find((c) => c.key === col)?.label}</th>)}
            {gates.map((m, i) => (
              <th key={m.id} className={`px-2 pb-2 text-center text-[10px] font-medium leading-tight ${i === 0 ? 'border-l-2 border-slate-200' : ''}`}>
                <div className="mx-auto line-clamp-2 max-w-[128px]" title={m.label}>{shortLabel(m.label)}</div>
              </th>
            ))}
            {icp.competencies.map((c, i) => (
              <th key={c.id} className={`px-2 pb-2 text-center text-[10px] font-medium leading-tight ${i === 0 ? 'border-l-2 border-slate-200' : ''}`}>
                {/* Competency names are already concise — show in full (no trim, no clamp). */}
                <div className="mx-auto max-w-[112px]" title={c.name}>{c.name}</div>
                <span className="mt-0.5 block text-[9px] font-normal text-slate-400">{c.weight}%</span>
              </th>
            ))}
            <th className="border-l-2 border-slate-200 px-3 pb-2 text-center text-[10px] font-semibold">Fit</th>
            {onDecide && <th className="pb-2" aria-hidden />}
          </tr>
        </thead>
        <tbody>
          {matches.map((m) => {
            const isOpen = open.has(m.candidate_id)
            const passedGates = m.gate_failures.length === 0
            const fitCls = BUCKET[fitBucketFor(m.score, passedGates)] ?? 'text-slate-600'
            const c = m.candidate
            return (
              <Fragment key={m.candidate_id}>
                <tr className={`border-t border-slate-100 transition-colors ${isOpen ? 'bg-slate-50' : 'hover:bg-slate-50/60'}`}>
                  {/* name / select — sticky */}
                  <td className={`sticky left-0 z-10 px-3 py-2.5 ${isOpen ? 'bg-slate-50' : 'bg-white'}`}>
                    <div className="flex items-start gap-2.5">
                      <input
                        type="checkbox"
                        checked={selected.has(m.candidate_id)}
                        onChange={() => onToggle(m.candidate_id)}
                        onClick={(e) => e.stopPropagation()}
                        className="mt-1 h-3.5 w-3.5 shrink-0 accent-slate-700"
                      />
                      <button type="button" onClick={() => toggleOpen(m.candidate_id)} className="min-w-0 text-left">
                        <div className="flex items-center gap-1.5">
                          <ChevronRight className={`h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform ${isOpen ? 'rotate-90' : ''}`} />
                          <span className="truncate text-sm font-medium text-slate-800">{c?.name ?? 'Unknown'}</span>
                          {m.data_incomplete && (
                            <FileQuestion className="h-3 w-3 shrink-0 text-amber-500" aria-label="Background unverified" />
                          )}
                          {m.level_badge && (
                            <span title="Which level of the search plan reached this person" className="inline-flex shrink-0 items-center rounded-full bg-indigo-50 px-1.5 py-0.5 text-[9px] font-semibold text-indigo-700">{m.level_badge}</span>
                          )}
                          {m.source_badge && (
                            <span className="inline-flex shrink-0 items-center rounded-full bg-sky-50 px-1.5 py-0.5 text-[9px] font-semibold text-sky-700">{m.source_badge}</span>
                          )}
                          {m.unreachable && (
                            <span className="inline-flex shrink-0 items-center rounded-full bg-amber-50 px-1.5 py-0.5 text-[9px] font-semibold text-amber-600">no contact</span>
                          )}
                          {m.outside_plan && (
                            <span title="Outside the plan's location or years band" className="inline-flex shrink-0 items-center rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-semibold text-slate-500">outside plan: {m.outside_plan}</span>
                          )}
                        </div>
                        <div className="mt-0.5 flex items-center gap-2.5 pl-5 text-[11.5px] font-medium text-slate-500">
                          {c?.current_company && <span className="inline-flex items-center gap-1"><Building2 className="h-3 w-3 text-slate-400" />{c.current_company}</span>}
                          {c?.location && <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3 text-slate-400" />{c.location}</span>}
                        </div>
                        {(m.tags?.length ?? 0) > 0 && (
                          <div className="mt-1 flex flex-wrap gap-1 pl-5">
                            {m.tags!.slice(0, 3).map((t) => <span key={t} className="rounded bg-slate-100 px-1.5 py-0.5 text-[9px] font-medium text-slate-600">{t}</span>)}
                          </div>
                        )}
                      </button>
                      {(onStar || onHide || onOpenProfile) && (
                        <div className="ml-auto flex shrink-0 items-center gap-0.5 pt-0.5">
                          {onStar && <button type="button" title={m.starred ? 'Starred — click to unstar' : 'Star (shortlist without spending an unlock)'} onClick={(e) => { e.stopPropagation(); onStar(m.candidate_id, !m.starred) }} className={`rounded p-1 ${m.starred ? 'text-amber-500' : 'text-slate-300 hover:text-amber-500'}`}><Star className="h-3.5 w-3.5" fill={m.starred ? 'currentColor' : 'none'} /></button>}
                          {onOpenProfile && <button type="button" title="Open profile" onClick={(e) => { e.stopPropagation(); onOpenProfile(m.candidate_id) }} className="rounded p-1 text-slate-300 hover:text-slate-600"><PanelRightOpen className="h-3.5 w-3.5" /></button>}
                          {onHide && <button type="button" title="Hide from this job" onClick={(e) => { e.stopPropagation(); onHide(m.candidate_id) }} className="rounded p-1 text-slate-300 hover:text-rose-500"><EyeOff className="h-3.5 w-3.5" /></button>}
                        </div>
                      )}
                    </div>
                  </td>
                  {extra.map((col) => <td key={col} className="px-2 py-2.5 text-left text-[11px] text-slate-600"><span className="line-clamp-2 max-w-[160px]" title={extraValue(m, col)}>{extraValue(m, col)}</span></td>)}
                  {/* must-have gates */}
                  {m.pending && [...gates, ...icp.competencies].map((col, i) => (
                    <td key={col.id} className={`px-2 py-2.5 text-center ${i === 0 || i === gates.length ? 'border-l-2 border-slate-100' : ''}`}>
                      <span className="inline-block h-2 w-6 animate-pulse rounded bg-slate-200" aria-label="Scoring…" />
                    </td>
                  ))}
                  {!m.pending && gates.map((mh, i) => {
                    const st = gateState(m, mh.label)
                    return (
                      <td key={mh.id} className={`relative px-2 py-2.5 text-center ${i === 0 ? 'border-l-2 border-slate-100' : ''}`}>
                        <button type="button" title="Why? Click for the evidence" onClick={(e) => { e.stopPropagation(); setPop(pop?.id === m.candidate_id && pop.key === mh.id ? null : { id: m.candidate_id, key: mh.id }) }}
                          className={`inline-grid h-6 w-6 place-items-center rounded-md text-[13px] font-bold ${GATE_CELL[st]}`}>
                          {GATE_GLYPH[st]}
                        </button>
                        {pop?.id === m.candidate_id && pop.key === mh.id && (
                          <Evidence onClose={() => setPop(null)} title={mh.label} text={m.gate_reasons?.[mh.label] || (st === 'unknown' ? 'Not verifiable from the data on file.' : st === 'pass' ? 'Met.' : 'Not met.')} />
                        )}
                      </td>
                    )
                  })}
                  {/* competency ratings */}
                  {!m.pending && icp.competencies.map((cp, i) => (
                    <td key={cp.id} className={`relative px-2 py-2.5 text-center ${i === 0 ? 'border-l-2 border-slate-100' : ''}`}>
                      <button type="button" title="Why? Click for the evidence" onClick={(e) => { e.stopPropagation(); setPop(pop?.id === m.candidate_id && pop.key === cp.id ? null : { id: m.candidate_id, key: cp.id }) }} className="inline-block rounded px-1 hover:bg-slate-100">
                        <RatingBar rating={compFor(m, cp.name, i)?.rating ?? 0} />
                      </button>
                      {pop?.id === m.candidate_id && pop.key === cp.id && (
                        <Evidence onClose={() => setPop(null)} title={cp.name} text={compFor(m, cp.name, i)?.evidence || 'No evidence recorded.'} />
                      )}
                    </td>
                  ))}
                  {/* fit */}
                  <td className="border-l-2 border-slate-100 px-3 py-2.5 text-center">
                    {m.pending
                      ? <Loader2 className="mx-auto h-4 w-4 animate-spin text-slate-300" aria-label="Scoring…" />
                      : <span className={`text-base font-bold tabular-nums ${fitCls}`}>{m.score}</span>}
                  </td>
                  {/* decide (internal pocket only) */}
                  {onDecide && (
                    <td className="px-2 py-2.5">
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); onDecide(m.candidate_id, 'yes') }}
                          title="Good fit"
                          className={`rounded p-1 ${m.decision === 'yes' ? 'bg-emerald-100 text-emerald-700' : 'text-slate-300 hover:bg-slate-100 hover:text-emerald-600'}`}
                        >
                          <ThumbsUp className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); onDecide(m.candidate_id, 'no') }}
                          title="Not a fit"
                          className={`rounded p-1 ${m.decision === 'no' ? 'bg-red-100 text-red-700' : 'text-slate-300 hover:bg-slate-100 hover:text-red-600'}`}
                        >
                          <ThumbsDown className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  )}
                </tr>

                {isOpen && (
                  <tr>
                    <td colSpan={cols} className="bg-slate-50/70 p-0">
                      <div className="px-5 py-4">
                        {m.rationale && (
                          <p className="mb-3 max-w-3xl text-xs text-slate-600">
                            <span className="font-semibold text-slate-700">Why this rank: </span>{m.rationale}
                          </p>
                        )}
                        {(m.red_flags?.length > 0 || m.data_incomplete) && (
                          <div className="mb-3 flex flex-wrap gap-1.5">
                            {m.data_incomplete && (
                              <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] text-amber-700">
                                <FileQuestion className="mr-0.5 inline h-2.5 w-2.5" />Background unverified — enrich to confirm
                              </span>
                            )}
                            {m.red_flags?.map((f) => (
                              <span key={f} className="rounded-full bg-rose-50 px-2 py-0.5 text-[11px] text-rose-700">△ {f}</span>
                            ))}
                          </div>
                        )}
                        <div className="grid gap-x-10 gap-y-1 md:grid-cols-2">
                          {gates.map((mh) => {
                            const st = gateState(m, mh.label)
                            return (
                              <div key={mh.id} className="flex items-start gap-2.5 border-t border-slate-200/70 py-2 first:border-0 md:[&:nth-child(2)]:border-0">
                                <span className={`inline-grid h-5 w-5 shrink-0 place-items-center rounded text-[11px] font-bold ${GATE_CELL[st]}`}>
                                  {GATE_GLYPH[st]}
                                </span>
                                <div className="min-w-0">
                                  <div className="text-[13px] font-medium text-slate-700">{mh.label}</div>
                                  <div className="text-[11px] text-slate-400">Must-have{st === 'fail' ? ' · missing' : st === 'unknown' ? ' · not verifiable from the data on file' : ''}</div>
                                </div>
                              </div>
                            )
                          })}
                          {icp.competencies.map((cp, i) => {
                            const cc = compFor(m, cp.name, i)
                            const r = cc ? RATING[cc.rating] : undefined
                            return (
                              <div key={cp.id} className="flex items-start gap-2.5 border-t border-slate-200/70 py-2">
                                <span className={`inline-grid h-5 min-w-[3rem] shrink-0 place-items-center rounded px-1 text-[10px] font-bold ${r ? r.cls : 'bg-slate-100 text-slate-400'}`}>
                                  {r ? r.label : 'n/a'}
                                </span>
                                <div className="min-w-0">
                                  <div className="text-[13px] font-medium text-slate-700">
                                    {cp.name}<span className="ml-1.5 text-[10px] font-normal text-slate-400">· {cp.weight}% weight</span>
                                  </div>
                                  {cc?.evidence && <div className="text-[11px] italic text-slate-500">&ldquo;{cc.evidence}&rdquo;</div>}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                        {(m.skills?.length ?? 0) > 0 && (
                          <div className="mt-3 flex flex-wrap gap-1">
                            {m.skills!.slice(0, 12).map((s, i) => (
                              <span key={i} className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">{s}</span>
                            ))}
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
