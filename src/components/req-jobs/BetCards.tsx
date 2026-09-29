'use client'

import { Fragment, useState } from 'react'
import { Briefcase, Rocket, Compass, Sparkles, ThumbsUp, ThumbsDown, TriangleAlert } from 'lucide-react'
import { BrandIcon } from '@/components/ui/BrandIcon'
import { CriterionEditor } from '@/components/req-jobs/IdealProfileTiles'
import { companiesFor, searchPassFor, sortedPools, specificTitles, type Archetype } from '@/lib/bets'
import { groupEmployerAliases } from '@/lib/employer-aliases'
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
  archetypes, brief, bets = [], onChange, onRemoveBet, options, renderProfile, renderCandidate,
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
}) {
  const stacked = Boolean(renderProfile)
  const [editingId, setEditingId] = useState<string | null>(null)
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
  cards.sort((x, y) => (x.n ?? 99) - (y.n ?? 99))
  let plain = 0

  return (
    <div>
      {cards.some((c) => c.n != null) && (
        <p className="mb-1.5 text-[11px] text-slate-400">
          Searched in this order — each bet is exhausted before the next one starts, so
          these are not sampled evenly.{onChange && bets.length > 0 ? ' Click At or As to change where we look.' : ''}
        </p>
      )}
      <div className={stacked ? 'space-y-3' : 'grid grid-cols-1 gap-2.5 md:grid-cols-3'}>
      {cards.map(({ a, n, label }, i) => {
        const look = a?.is_non_obvious ? GOLD : LOOKS[plain++ % LOOKS.length]
        const rows = n != null ? bets.filter((c) => c.bet === n) : []
        const at = rows.find((c) => c.kind.startsWith('employer_'))
        const as = rows.find((c) => c.kind.startsWith('title_'))
        // Not organised into bets yet: the same two lines, from the brief.
        const pool = !rows.length && n != null ? pools[n - 1] : undefined
        const briefLogos = a && !rows.length ? companiesFor(a, brief) : []
        const briefTitles = pool?.role_types ?? []
        const editing = rows.find((c) => c.id === editingId)
        const card = (
          <div className={`group/card rounded-xl bg-gradient-to-br to-white p-3 ring-1 ${look.card}`}>
            <div className="flex items-center gap-2">
              <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-white ${look.circle}`}>
                <look.Icon className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-1.5">
                  <span className="min-w-0 truncate text-sm font-semibold text-slate-900" title={label}>{label}</span>
                  {n != null && (
                    <span
                      title={`Searched ${ordinal(n)}`}
                      className="shrink-0 rounded bg-white/70 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-slate-500 ring-1 ring-slate-200"
                    >
                      {ordinal(n)}
                    </span>
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
              </div>
            ) : a?.where_from ? (
              <p className="mt-2 line-clamp-1 text-[11px] text-slate-400" title={a.where_from}>From: {a.where_from}</p>
            ) : null}

            {/* Only level words at finance firms: the market search skips them, so offer the work they mean. */}
            {(() => {
              const better = as && at && onChange ? specificTitles(as.values, { label, companies: at.values }) : null
              if (!better) return null
              const added = better.filter((t) => !as!.values.includes(t))
              return (
                <div className="mt-2 rounded-lg bg-amber-50 px-2.5 py-2 text-[11px] leading-relaxed text-amber-900 ring-1 ring-amber-100">
                  &ldquo;{as!.values.join('” and “')}&rdquo; alone fit anyone at these firms, engineers included — the market
                  search skips them. Add {added.slice(0, 3).join(', ')}{added.length > 3 ? ` +${added.length - 3} more` : ''}?
                  <button
                    type="button"
                    onClick={() => onChange!({ ...as!, values: better })}
                    className="ml-1.5 rounded-md bg-white px-1.5 py-0.5 font-medium text-amber-900 ring-1 ring-amber-200 hover:bg-amber-100"
                  >
                    Add these titles
                  </button>
                </div>
              )
            })()}

            {editing && onChange && (
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
        if (!stacked) return <Fragment key={i}>{card}</Fragment>
        return (
          <div key={i} className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_19rem]">
            {card}
            {n != null && renderCandidate ? renderCandidate(n, label) : <div className="hidden lg:block" />}
          </div>
        )
      })}
      </div>
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
