'use client'

import { BrandIcon } from '@/components/ui/BrandIcon'
import { TraitChips, TenureTiles } from '@/components/candidates/ProfileStats'
import {
  formatDuration,
  formatRange,
  formatYears,
  groupByEmployer,
  summarizeHistory,
  type EmployerStint,
  type StintRole,
  type WorkRole,
} from '@/lib/ui/work-history'

/**
 * The dated work history, presented the way Juicebox does: one logo per EMPLOYER,
 * roles nested underneath it, the date range and duration right-aligned in their own
 * column, and a header that answers "how long, and how settled" before the recruiter
 * reads a single role.
 *
 * The employer, not the role, is the unit. Three promotions at Airbnb are one logo and
 * one six-year span with the steps beneath it — a flat list of three would read as
 * job-hopping, which is the opposite of what happened.
 *
 * PURE over props so the same component serves the profile, a preview fixture and
 * (later) the candidate list card. All the arithmetic lives in lib/ui/work-history.
 */

/** Range over duration, right-aligned — the column Juicebox reads dates from. */
function DateColumn({ start, end, isCurrent, months }: { start: string | null | undefined; end: string | null | undefined; isCurrent: boolean; months: number | null }) {
  return (
    <div className="shrink-0 pl-3 text-right">
      <p className="whitespace-nowrap text-xs text-slate-500">{formatRange(start, end, isCurrent)}</p>
      {months != null && <p className="whitespace-nowrap text-xs text-slate-400">{formatDuration(months)}</p>}
    </div>
  )
}

/** A stint with one role: the title leads, because that is what identifies the job. */
function SingleRole({ stint, role }: { stint: EmployerStint; role: StintRole }) {
  return (
    <div className="flex gap-3">
      <BrandIcon name={stint.employer} size={32} className="mt-0.5" />
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className="min-w-0 text-sm font-semibold leading-snug text-slate-900">{role.title ?? 'Role'}</p>
          <DateColumn start={role.start_date} end={role.end_date} isCurrent={role.is_current} months={role.months} />
        </div>
        {stint.employer && <p className="text-sm leading-snug text-slate-600">{stint.employer}</p>}
        {role.location && <p className="text-xs text-slate-400">{role.location}</p>}
        {role.summary && <p className="mt-1.5 text-xs leading-relaxed text-slate-600">{role.summary}</p>}
      </div>
    </div>
  )
}

/**
 * A stint with several roles: the employer leads with the whole span, and the roles
 * hang off a rail beneath it — the shape that makes a promotion legible as a promotion.
 */
function GroupedRoles({ stint }: { stint: EmployerStint }) {
  return (
    <div className="flex gap-3">
      <BrandIcon name={stint.employer} size={32} className="mt-0.5" />
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className="min-w-0 text-sm font-semibold leading-snug text-slate-900">{stint.employer ?? 'Employer'}</p>
          <DateColumn start={stint.startDate} end={stint.endDate} isCurrent={stint.isCurrent} months={stint.months} />
        </div>
        <ol className="mt-2 space-y-2.5 border-l border-slate-200 pl-4">
          {stint.roles.map((role, i) => (
            <li key={i} className="relative">
              <span className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full border border-slate-300 bg-white" />
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                  <span className="text-sm font-medium leading-snug text-slate-800">{role.title ?? 'Role'}</span>
                  {role.isPromotion && (
                    <span
                      title="A step up the ladder from the previous role at this employer"
                      className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700"
                    >
                      Promotion
                    </span>
                  )}
                </div>
                <DateColumn start={role.start_date} end={role.end_date} isCurrent={role.is_current} months={role.months} />
              </div>
              {role.location && <p className="text-xs text-slate-400">{role.location}</p>}
              {role.summary && <p className="mt-1 text-xs leading-relaxed text-slate-600">{role.summary}</p>}
            </li>
          ))}
        </ol>
      </div>
    </div>
  )
}

export function ExperienceTimeline({
  roles,
  graduationYear,
  now = new Date(),
}: {
  roles: WorkRole[]
  graduationYear?: number | null
  now?: Date
}) {
  if (!roles.length) return null
  const stints = groupByEmployer(roles, now)
  const { totalMonths, averageTenureMonths, currentTenureMonths } = summarizeHistory(roles, now)

  // Only the facts we actually have. A profile with one unfinished job has no average
  // tenure, and printing "0 years average tenure" there would be a claim, not a blank.
  const meta = [
    totalMonths != null ? `${formatYears(totalMonths)} total` : null,
    averageTenureMonths != null ? `${formatYears(averageTenureMonths)} average tenure` : null,
  ].filter(Boolean)

  return (
    <section>
      <h3 className="mb-3 flex flex-wrap items-baseline gap-x-1.5 text-sm font-semibold text-slate-900">
        Experience
        {meta.length > 0 && <span className="text-xs font-normal text-slate-400">· {meta.join(' · ')}</span>}
      </h3>

      <div className="mb-4 space-y-3">
        <TraitChips roles={roles} graduationYear={graduationYear} />
        <TenureTiles
          averageTenureMonths={averageTenureMonths}
          currentTenureMonths={currentTenureMonths}
          totalMonths={totalMonths}
        />
      </div>

      <div className="space-y-4">
        {stints.map((stint, i) =>
          stint.roles.length === 1
            ? <SingleRole key={i} stint={stint} role={stint.roles[0]} />
            : <GroupedRoles key={i} stint={stint} />,
        )}
      </div>
    </section>
  )
}
