'use client'

import { Fragment, useState } from 'react'
import { toast } from 'sonner'
import { Briefcase, Rocket, Compass, Sparkles, ThumbsUp, ThumbsDown, TriangleAlert, Layers, ChevronUp, ChevronDown, Pencil } from 'lucide-react'
import { BrandIcon } from '@/components/ui/BrandIcon'
import { CriterionEditor } from '@/components/req-jobs/IdealProfileTiles'
import { companiesFor, searchPassFor, sortedPools, type Archetype } from '@/lib/bets'
import { groupEmployerAliases } from '@/lib/employer-aliases'
import { betPosition } from '@/lib/icp-gates'
import type { RecruiterBrief } from '@/lib/types/icp'
import type { SearchCriterion } from '@/lib/types/search-spec'
import type { FetchedOptions } from '@/lib/icp-options'

export { companiesFor, searchPassFor, nameVariants } from '@/lib/bets'

/** Card looks, in order; a non-obvious bet always gets the gold one. */
const LOOKS = [
  { Icon: Briefcase, circle: 'bg-emerald-600', card: 'from-emerald-50 ring-emerald-100' },
  { Icon: Rocket,    circle: 'bg-sky-600',     card: 'from-sky-50 ring-sky-100' },
  { Icon: Compass,   circle: 'bg-violet-600',  card: 'from-violet-50 ring-violet-100' },
]
const GOLD = { Icon: Sparkles, circle: 'bg-gold-500', card: 'from-gold-50 ring-gold-200' }

/**
 * The ICP's archetypes ("bets") as compact people cards: who they are, where we look for
 * them, what would attract them, what would not, and what could go wrong if you hire
 * them.
 *
 * THE CARD IS THE WHOLE BET. "At" is the bet's companies and "As" the titles searched
 * there — the profile's bet rows, edited here by clicking either line. They used to be a
 * second copy further down, in the ideal profile, which said the same thing again. For a
 * profile not yet organised into bets the two lines come from the brief, read-only.
 */
export function BetCards({
  archetypes, brief, bets = [], onChange, onRemoveBet, options, renderProfile, renderCandidate, onSuggestTitles, onAddRow, renderRow, onMoveBet,
}: {
  archetypes: Archetype[]
  brief?: RecruiterBrief | null
  /** The profile's bet rows (employer + title per bet). */
  bets?: SearchCriterion[]
  onChange?: (next: SearchCriterion) => void
  onRemoveBet?: (ids: string[]) => void
  options?: FetchedOptions
  /**
   * The bet's own ideal profile, shown under its card. Given, the bets STACK — one
   * full-width row each, the card and its profile on the left and `renderCandidate`
   * (a real person who fits it) on the right — instead of three cards side by side.
   */
  renderProfile?: (bet: number, label: string) => React.ReactNode
  renderCandidate?: (bet: number, label: string) => React.ReactNode
  /** Ask the recruiter brain for this bet's titles and exclusions (one AI call). */
  onSuggestTitles?: (bet: number, label: string, rows: SearchCriterion[]) => Promise<SuggestedTitles>
  /** Add a bet row the bet does not have yet (its exclusions). */
  onAddRow?: (row: SearchCriterion) => void
  /**
   * Frame each stacked bet yourself: the card arrives unframed (no tint or ring) beside
   * its candidate, so the two can sit in ONE card. The "searched in order" line is left
   * to the caller too.
   */
  renderRow?: (row: BetRow) => React.ReactNode
  /** Move a bet one place up (-1) or down (+1) in the search order. */
  onMoveBet?: (bet: number, step: -1 | 1) => void
}) {
  const stacked = Boolean(renderProfile)
  const [editingId, setEditingId] = useState<string | null>(null)
  // The pencil: every line of one bet open for editing at once.
  const [editingBet, setEditingBet] = useState<number | null>(null)
  // Bumped by a line's cancel, so that line's editor starts again from the saved values.
  const [resets, setResets] = useState<Record<string, number>>({})
  const pools = sortedPools(brief)

  // Each card finds its bet by name (the profile names bets after their cards), else by
  // the pass its companies are reached on. A bet with no card still gets one.
  const claimed = new Set<number>()
  const cards: { a: Archetype | null; n: number | null; label: string }[] = archetypes.map((a) => {
    const byName = bets.find((c) => c.bet_label === a.name)?.bet ?? null
    const n = byName ?? searchPassFor(a, brief)?.pass ?? null
    if (n != null) claimed.add(n)
    return { a, n, label: a.name }
  })
  for (const n of Array.from(new Set(bets.map((c) => c.bet as number)))) {
    if (!claimed.has(n)) cards.push({ a: null, n, label: bets.find((c) => c.bet === n)?.bet_label ?? `Bet ${n}` })
  }
  // In search order: the recruiter's (the arrows), else by number.
  const pos = (n: number | null) => (n == null ? 99 : bets.some((c) => c.bet === n) ? betPosition(bets, n) : n)
  cards.sort((x, y) => pos(x.n) - pos(y.n) || (x.n ?? 99) - (y.n ?? 99))
  // Only bets with rows can move (the arrows change their rows).
  const movable = cards.filter((c) => c.n != null && bets.some((r) => r.bet === c.n)).map((c) => c.n as number)
  let plain = 0

  return (
    <div>
      {!renderRow && cards.some((c) => c.n != null) && (
        <p className="mb-1.5 text-[11px] text-slate-400">
          Searched in this order — each bet is exhausted before the next one starts, so
          these are not sampled evenly.{onChange && bets.length > 0 ? ' Click At or As to change where we look.' : ''}
        </p>
      )}
      <div className={stacked ? 'space-y-3' : 'grid grid-cols-1 gap-2.5 md:grid-cols-3'}>
      {cards.map(({ a, n, label }, i) => {
        // Tied to the bet's number, so a bet keeps its colour when it moves.
        const look = a?.is_non_obvious ? GOLD : LOOKS[(n != null ? n - 1 : plain++) % LOOKS.length]
        const rank = cards.slice(0, i + 1).filter((c) => c.n != null).length
        const slot = n != null ? movable.indexOf(n) : -1
        // By bet, not position: a moved bet keeps its sample person (and their state).
        const rowKey = n != null ? `bet-${n}` : `card-${label}`
        const rows = n != null ? bets.filter((c) => c.bet === n) : []
        const at = rows.find((c) => c.kind.startsWith('employer_'))
        const as = rows.find((c) => c.kind.startsWith('title_') && !c.exclude)
        // The jobs at these employers that are not this bet — written per bet by the brief.
        const not = rows.find((c) => c.kind.startsWith('title_') && c.exclude)
        // Not organised into bets yet: the same two lines, from the brief.
        const pool = !rows.length && n != null ? pools[n - 1] : undefined
        const briefLogos = a && !rows.length ? companiesFor(a, brief) : []
        const briefTitles = pool?.role_types ?? []
        const editing = rows.find((c) => c.id === editingId)
        const canEdit = Boolean(onChange && n != null && rows.length)
        const betOpen = canEdit && editingBet === n
        const toggleBet = () => { setEditingId(null); setEditingBet(betOpen ? null : n) }
        const card = (
          <div className={renderRow ? 'group/card min-w-0' : `group/card rounded-xl bg-gradient-to-br to-white p-3 ring-1 ${look.card}`}>
            <div className="flex items-center gap-2">
              <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-white ${look.circle}`}>
                <look.Icon className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-1.5">
                  {canEdit ? (
                    <button type="button" onClick={toggleBet} title={`${label} — click to edit this bet`}
                      className="min-w-0 truncate text-left text-sm font-semibold text-slate-900 hover:text-slate-600">{label}</button>
                  ) : (
                    <span className="min-w-0 truncate text-sm font-semibold text-slate-900" title={label}>{label}</span>
                  )}
                  {n != null && (
                    <span
                      title={`Find new people searches this bet ${ordinal(rank)}`}
                      className="shrink-0 rounded bg-white/70 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-slate-500 ring-1 ring-slate-200"
                    >
                      {ordinal(rank)}
                    </span>
                  )}
                  {onMoveBet && slot >= 0 && movable.length > 1 && (
                    <span className="inline-flex shrink-0 self-center rounded bg-white/70 ring-1 ring-slate-200">
                      <button type="button" onClick={() => onMoveBet(n!, -1)} disabled={slot === 0} title="Search this bet earlier"
                        className="grid h-4 w-4 place-items-center text-slate-400 hover:text-slate-800 disabled:opacity-30"><ChevronUp className="h-3 w-3" /></button>
                      <button type="button" onClick={() => onMoveBet(n!, 1)} disabled={slot === movable.length - 1} title="Search this bet later"
                        className="grid h-4 w-4 place-items-center text-slate-400 hover:text-slate-800 disabled:opacity-30"><ChevronDown className="h-3 w-3" /></button>
                    </span>
                  )}
                  {canEdit && (
                    <button type="button" onClick={toggleBet} title="Edit this bet — where we look, the titles, what to skip"
                      className={`grid h-4 w-4 shrink-0 place-items-center self-center rounded ring-1 ${betOpen ? 'bg-slate-900 text-white ring-slate-900' : 'bg-white/70 text-slate-400 ring-slate-200 hover:text-slate-800'}`}>
                      <Pencil className="h-2.5 w-2.5" />
                    </button>
                  )}
                  {onRemoveBet && rows.length > 0 && (
                    <button
                      type="button"
                      onClick={() => { onRemoveBet(rows.map((c) => c.id)); setEditingId(null) }}
                      className="ml-auto hidden shrink-0 text-[10px] text-slate-300 hover:text-red-500 group-hover/card:inline"
                      title="Stop searching this bet"
                    >
                      Remove
                    </button>
                  )}
                </div>
                {a?.is_non_obvious && <div className="text-[11px] font-semibold text-gold-700">✦ non-obvious</div>}
                {n == null && (
                  <div className="text-[10px] text-slate-400" title="No feeder pool names this bet's companies, so the search has no lane aimed at it.">
                    no lane of its own
                  </div>
                )}
              </div>
            </div>
            {a?.thesis && (
              <p className="mt-2 line-clamp-2 text-[11px] leading-relaxed text-slate-600" title={a.thesis}>{a.thesis}</p>
            )}

            {/* Where we look: At (companies, logos — names on hover) and As (titles). */}
            {at || as || briefLogos.length || briefTitles.length ? (
              <div className="mt-2 grid grid-cols-[1.6rem_1fr] items-start gap-y-1 text-[11px]">
                <span className="pt-0.5 font-semibold text-slate-400">At</span>
                <Line c={at} onOpen={onChange && at ? () => setEditingId(at.id === editingId ? null : at.id) : undefined}>
                  <span className="flex flex-wrap items-center gap-1">
                    {(at ? groupEmployerAliases(at.values).map((g) => ({ key: g.display, logo: g.members[0], name: g.display })) : briefLogos.map((c) => ({ key: c, logo: c, name: c })))
                      .map((g) => <span key={g.key} title={g.name}><BrandIcon name={g.logo} size={20} /></span>)}
                  </span>
                </Line>
                <span className="pt-0.5 font-semibold text-slate-400">As</span>
                <Line c={as} onOpen={onChange && as ? () => setEditingId(as.id === editingId ? null : as.id) : undefined}>
                  <span className="text-slate-700">{(as?.values ?? briefTitles).join(' · ') || <span className="text-slate-400">the role&apos;s own titles</span>}</span>
                </Line>
                {not && (
                  <>
                    <span className="pt-0.5 font-semibold text-slate-400" title="Jobs at these companies that are not this bet — skipped in its search">Not</span>
                    <Line c={not} onOpen={onChange ? () => setEditingId(not.id === editingId ? null : not.id) : undefined}>
                      <span className="text-slate-500 line-through decoration-slate-300">{not.values.join(' · ')}</span>
                    </Line>
                  </>
                )}
              </div>
            ) : a?.where_from ? (
              <p className="mt-2 line-clamp-1 text-[11px] text-slate-400" title={a.where_from}>From: {a.where_from}</p>
            ) : null}

            {onSuggestTitles && onChange && n != null && at && (
              <SuggestTitles
                bet={n}
                label={label}
                rows={rows}
                titlesRow={as}
                notRow={not}
                suggest={onSuggestTitles}
                onApply={(titles, exclusions) => {
                  if (as) onChange({ ...as, values: titles })
                  else if (titles.length) onAddRow?.({ id: `ip-bet-${n}-titles`, kind: 'title_current', values: titles, relax_at: 3, bet: n, bet_label: label })
                  if (not) onChange({ ...not, values: exclusions })
                  else if (exclusions.length) onAddRow?.({ id: `ip-bet-${n}-not`, kind: 'title_current', values: exclusions, exclude: true, relax_at: 3, bet: n, bet_label: label })
                }}
              />
            )}

            {betOpen && (
              <div className="mt-2 space-y-2 rounded-lg bg-white p-2.5 ring-1 ring-slate-300">
                {([['At', 'The companies we look at', at], ['As', 'The titles searched there', as], ['Not', 'Jobs at these companies to skip', not]] as const)
                  .filter(([, , c]) => c)
                  .map(([tag, what, c]) => (
                    <div key={c!.id}>
                      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">{tag} · <span className="normal-case tracking-normal">{what}</span></div>
                      {/* Remounted after a save, so it shows the saved lines. */}
                      <CriterionEditor key={`${c!.id}:${c!.values.join('|')}:${resets[c!.id] ?? 0}`} c={c!} options={options}
                        onCancel={() => setResets((r) => ({ ...r, [c!.id]: (r[c!.id] ?? 0) + 1 }))} onSave={(next) => onChange!(next)} />
                    </div>
                  ))}
                <div className="flex justify-end">
                  <button type="button" onClick={() => setEditingBet(null)} className="rounded-md bg-slate-900 px-2.5 py-0.5 text-[11px] font-medium text-white hover:bg-slate-700">Done</button>
                </div>
              </div>
            )}

            {!betOpen && editing && onChange && (
              <div className="mt-2 rounded-lg bg-white p-2 ring-1 ring-slate-200">
                <CriterionEditor
                  key={editing.id}
                  c={editing}
                  options={options}
                  onCancel={() => setEditingId(null)}
                  onSave={(next) => { onChange(next); setEditingId(null) }}
                />
              </div>
            )}

            {a && (a.why_interested || a.why_no || a.hire_risk) && (
              <div className={`mt-2.5 text-[11px] leading-snug ${stacked ? 'grid gap-x-4 gap-y-1 md:grid-cols-3' : 'space-y-1'}`}>
                {a.why_interested && (
                  <div className="flex gap-1.5 text-emerald-700" title={a.why_interested}>
                    <ThumbsUp className="mt-0.5 h-3 w-3 shrink-0" /><span className="line-clamp-2">{a.why_interested}</span>
                  </div>
                )}
                {a.why_no && (
                  <div className="flex gap-1.5 text-rose-600" title={a.why_no}>
                    <ThumbsDown className="mt-0.5 h-3 w-3 shrink-0" /><span className="line-clamp-2">{a.why_no}</span>
                  </div>
                )}
                {a.hire_risk && (
                  <div className="flex gap-1.5 text-slate-400" title={a.hire_risk}>
                    <TriangleAlert className="mt-0.5 h-3 w-3 shrink-0" /><span className="line-clamp-2">{a.hire_risk}</span>
                  </div>
                )}
              </div>
            )}

            {/* This bet's ideal profile, right under who it is. */}
            {stacked && n != null && <div className="mt-3">{renderProfile!(n, label)}</div>}
          </div>
        )
        if (!stacked) return <Fragment key={rowKey}>{card}</Fragment>
        if (renderRow) {
          const candidate = n != null && renderCandidate ? renderCandidate(n, label) : null
          return <Fragment key={rowKey}>{renderRow({ card, candidate, look, n, label, nonObvious: Boolean(a?.is_non_obvious) })}</Fragment>
        }
        return (
          <div key={rowKey} className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_19rem]">
            {card}
            {n != null && renderCandidate ? renderCandidate(n, label) : <div className="hidden lg:block" />}
          </div>
        )
      })}
      </div>
    </div>
  )
}

export interface BetRow {
  card: React.ReactNode
  candidate: React.ReactNode | null
  look: { Icon: React.ComponentType<{ className?: string }>; circle: string; card: string }
  n: number | null
  label: string
  nonObvious: boolean
}

/** The card that holds every bet: a count, and the order they are searched in. */
export function BetsPanel({ count, children }: { count: number; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="mb-3 flex items-center gap-2.5">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-slate-900 text-white"><Layers className="h-4 w-4" /></span>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-slate-900">Bets</span>
            {count > 0 && <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">{count}</span>}
          </div>
          <div className="text-[11px] text-slate-500">
            The kinds of candidates worth looking for. Keep the ones you like, and click on a bet to edit it.
            {count > 1 && <> Find new people searches them top to bottom — use the arrows to change which comes first.</>}
          </div>
        </div>
      </div>
      {children}
    </section>
  )
}

/** One bet as ONE card: who it is (tinted) on the left, the person it finds on the right. */
export function BetSplitRow({ row }: { row: BetRow }) {
  return (
    <div className={`grid overflow-hidden rounded-xl bg-gradient-to-br to-white ring-1 ${row.candidate ? 'lg:grid-cols-[minmax(0,1fr)_19rem]' : ''} ${row.look.card}`}>
      <div className="min-w-0 p-3">{row.card}</div>
      {row.candidate && <div className="border-t border-slate-100 bg-white p-3 lg:border-l lg:border-t-0">{row.candidate}</div>}
    </div>
  )
}

/** One of a card's At / As lines — a button when the bet is editable. */
function Line({ c, onOpen, children }: { c?: SearchCriterion; onOpen?: () => void; children: React.ReactNode }) {
  if (!onOpen) return <div className="min-w-0" title={c?.values.join(' · ')}>{children}</div>
  return (
    <button type="button" onClick={onOpen} title={`${c?.values.join(' · ')} — click to change`} className="-mx-1 min-w-0 rounded px-1 text-left hover:bg-white/80 hover:ring-1 hover:ring-slate-200">
      {children}
    </button>
  )
}

const ordinal = (n: number) => `${n}${n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th'}`

export interface SuggestedTitles {
  line_of_work?: string | null
  titles: { title: string; why?: string | null }[]
  exclusions: { title: string; why?: string | null }[]
  /** How many pool people at the bet's companies the suggestion was grounded on. */
  observed?: number
}

/**
 * "Suggest titles": the recruiter brain writes this bet's titles and the jobs to skip at
 * its companies, from the job, the bet and the titles real people there hold. Nothing
 * changes until the recruiter picks what to keep and applies it (then approves).
 */
function SuggestTitles({ bet, label, rows, titlesRow, notRow, suggest, onApply }: {
  bet: number
  label: string
  rows: SearchCriterion[]
  titlesRow?: SearchCriterion
  notRow?: SearchCriterion
  suggest: (bet: number, label: string, rows: SearchCriterion[]) => Promise<SuggestedTitles>
  onApply: (titles: string[], exclusions: string[]) => void
}) {
  const [state, setState] = useState<'idle' | 'loading' | 'open'>('idle')
  const [result, setResult] = useState<SuggestedTitles | null>(null)
  const [keepTitles, setKeepTitles] = useState<Set<string>>(new Set())
  const [keepNot, setKeepNot] = useState<Set<string>>(new Set())
  const current = titlesRow?.values ?? []
  const currentNot = notRow?.values ?? []

  async function run() {
    setState('loading')
    try {
      const r = await suggest(bet, label, rows)
      setResult(r)
      // Everything suggested starts ticked; today's titles too, so nothing vanishes unasked.
      setKeepTitles(new Set([...current, ...r.titles.map((t) => t.title)]))
      setKeepNot(new Set([...currentNot, ...r.exclusions.map((t) => t.title)]))
      setState('open')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not suggest titles')
      setState('idle')
    }
  }

  if (state !== 'open' || !result) {
    return (
      <button type="button" onClick={run} disabled={state === 'loading'}
        className="mt-2 inline-flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-800 disabled:opacity-60"
        title="The recruiter brain writes this bet's titles and the jobs to skip at its companies, from the job and the titles real people there hold">
        <Sparkles className="h-3 w-3" /> {state === 'loading' ? 'Thinking…' : 'Suggest titles'}
      </button>
    )
  }

  const list = (items: { title: string; why?: string | null; now?: boolean }[], keep: Set<string>, set: (s: Set<string>) => void) => (
    <ul className="space-y-0.5">
      {items.map((t) => (
        <li key={t.title}>
          <label className="flex items-start gap-1.5" title={t.why ?? undefined}>
            <input type="checkbox" className="mt-0.5 h-3 w-3" checked={keep.has(t.title)}
              onChange={(e) => { const n = new Set(keep); if (e.target.checked) n.add(t.title); else n.delete(t.title); set(n) }} />
            <span className="text-slate-700">{t.title}</span>
            {t.now ? <span className="text-slate-400">· today</span> : t.why ? <span className="line-clamp-1 text-slate-400">· {t.why}</span> : null}
          </label>
        </li>
      ))}
    </ul>
  )
  const merge = (now: string[], s: { title: string; why?: string | null }[]) =>
    [...now.map((t) => ({ title: t, now: true })), ...s.filter((x) => !now.includes(x.title))]

  return (
    <div className="mt-2 rounded-lg bg-white p-2.5 text-[11px] ring-1 ring-slate-200">
      <div className="mb-1.5 text-slate-500">
        {result.line_of_work && <span className="font-medium text-slate-700">{result.line_of_work}. </span>}
        {result.observed ? `Based on the job, this bet and the titles of ${result.observed} people at these companies in your pool.` : 'Based on the job and this bet (nobody at these companies in your pool yet).'}
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <div className="mb-0.5 font-semibold text-slate-500">Search for</div>
          {list(merge(current, result.titles), keepTitles, setKeepTitles)}
        </div>
        <div>
          <div className="mb-0.5 font-semibold text-slate-500">Skip at these companies</div>
          {list(merge(currentNot, result.exclusions), keepNot, setKeepNot)}
        </div>
      </div>
      <div className="mt-2 flex justify-end gap-1.5">
        <button type="button" onClick={() => setState('idle')} className="rounded-md px-2 py-0.5 text-slate-500 ring-1 ring-slate-200 hover:bg-slate-50">Cancel</button>
        <button type="button" onClick={() => { onApply(Array.from(keepTitles), Array.from(keepNot)); setState('idle') }}
          className="rounded-md bg-slate-900 px-2 py-0.5 font-medium text-white hover:bg-slate-700">Use these</button>
      </div>
    </div>
  )
}
