'use client'

import { formatDuration, type WorkRole } from '@/lib/ui/work-history'
import {
  Brain, Building2, Code2, Crown, Gem, GraduationCap, Hourglass, Landmark,
  Move, Rocket, TrendingUp, Users,
} from 'lucide-react'
import { deriveProfileChips, type ChipIcon } from '@/lib/profile-chips'

/**
 * Icon names from the pure chip rules, mapped to marks here. The derivation stays free
 * of React; this is the only place that knows what a "rocket" looks like.
 */
const CHIP_ICONS: Record<ChipIcon, typeof Rocket> = {
  rocket: Rocket,
  hourglass: Hourglass,
  'trending-up': TrendingUp,
  move: Move,
  graduation: GraduationCap,
  crown: Crown,
  users: Users,
  code: Code2,
  brain: Brain,
  building: Building2,
  gem: Gem,
  landmark: Landmark,
}

/**
 * The two summary rows above the experience timeline: the trait chips a recruiter
 * reads before anything else ("Fast career growth", "Long tenures", "Recently moved"),
 * and the three tenure numbers.
 *
 * The chips come from `lib/profile-chips`, which reads the dated history, the skills
 * list and the schools — what they do, how senior, how they move, where they studied.
 * Nobody types them and nothing stores them: a chip is a reading of the evidence, so it
 * is recomputed each time rather than going quietly stale when a résumé is re-extracted.
 *
 * A tile is omitted when its number is unknown rather than shown as a dash: "—" next to
 * "Current tenure" reads as "no current job", which is a claim we have not earned.
 */
export function TraitChips({
  roles,
  skills,
  education,
  country,
}: {
  roles: WorkRole[]
  skills?: string[]
  education?: { degree?: string | null; field?: string | null; school?: string | null; year?: number | null }[]
  country?: string | null
}) {
  const chips = deriveProfileChips({ experiences: roles, skills, education, country })
  if (!chips.length) return null
  return (
    <div className="flex flex-wrap gap-1.5">
      {chips.map((chip) => {
        const Icon = CHIP_ICONS[chip.icon]
        return (
          <span
            key={chip.label}
            title={chip.hint}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700"
          >
            <Icon className="h-3.5 w-3.5 shrink-0 text-slate-400" />
            {chip.label}
          </span>
        )
      })}
    </div>
  )
}

export function TenureTiles({
  averageTenureMonths,
  currentTenureMonths,
  totalMonths,
}: {
  averageTenureMonths: number | null
  currentTenureMonths: number | null
  totalMonths: number | null
}) {
  const tiles = [
    { label: 'Avg tenure', months: averageTenureMonths, hint: 'Mean time at one employer, across finished stints. A promotion is not a move.' },
    { label: 'Current tenure', months: currentTenureMonths, hint: 'Time at the current employer, including any promotions there.' },
    { label: 'Total experience', months: totalMonths, hint: 'Months actually employed: overlapping roles counted once, gaps excluded.' },
  ].filter((t) => t.months != null)

  if (!tiles.length) return null

  return (
    /* Three across at every width. A viewport breakpoint was wrong here: the pool
       drawer is 448px wide inside a full-size window, so `sm:` never fired and three
       short values became three tall tiles that pushed the timeline below the fold. */
    <div className="grid grid-cols-3 gap-2">
      {tiles.map((tile) => (
        <div key={tile.label} className="min-w-0 rounded-xl bg-slate-50 px-3 py-2" title={tile.hint}>
          <p className="truncate text-[11px] text-slate-500">{tile.label}</p>
          <p className="mt-0.5 truncate text-sm font-semibold tabular-nums text-slate-900">
            {formatDuration(tile.months)}
          </p>
        </div>
      ))}
    </div>
  )
}
