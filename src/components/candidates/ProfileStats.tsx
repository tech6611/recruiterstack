'use client'

import { formatDuration, type WorkRole } from '@/lib/ui/work-history'
import { deriveProfileTags } from '@/lib/profile-tags'

/**
 * The two summary rows above the experience timeline: the trait chips a recruiter
 * reads before anything else ("Fast career growth", "Long tenures", "Recently moved"),
 * and the three tenure numbers.
 *
 * The chips come from `lib/profile-tags`, the same rules the sourcing pool uses, so the
 * pool and the profile can never label the same person differently. They are derived
 * from the dated history — no AI, nothing to re-generate, nothing to go stale.
 *
 * A tile is omitted when its number is unknown rather than shown as a dash: "—" next to
 * "Current tenure" reads as "no current job", which is a claim we have not earned.
 */
export function TraitChips({ roles, graduationYear }: { roles: WorkRole[]; graduationYear?: number | null }) {
  const tags = deriveProfileTags(roles, { graduationYear })
  if (!tags.length) return null
  return (
    <div className="flex flex-wrap gap-1.5">
      {tags.map((tag) => (
        <span
          key={tag}
          className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700"
        >
          {tag}
        </span>
      ))}
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
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
      {tiles.map((tile) => (
        <div key={tile.label} className="rounded-xl bg-slate-50 px-3.5 py-2.5" title={tile.hint}>
          <p className="text-xs text-slate-500">{tile.label}</p>
          <p className="mt-0.5 text-sm font-semibold tabular-nums text-slate-900">
            {formatDuration(tile.months)}
          </p>
        </div>
      ))}
    </div>
  )
}
