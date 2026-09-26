'use client'

import { BrandIcon } from '@/components/ui/BrandIcon'
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
 * roles nested underneath it, a duration on every span, and a header that answers
 * "how long, and how settled" before the recruiter reads a single role.
 *
 * The employer, not the role, is the unit. Three promotions at Airbnb are one logo and
 * one six-year span with the steps beneath it — a flat list of three would read as
 * job-hopping, which is the opposite of what happened.
 *
 * PURE over props so the same component serves the profile, a preview fixture and
 * (later) the candidate list card. All the arithmetic lives in lib/ui/work-history.
 */

/** A stint with one role: the title leads, because that is what identifies the job. */
function SingleRole({ stint, role }: { stint: EmployerStint; role: StintRole }) {
  return (
    <div className="flex gap-3">
      <BrandIcon name={stint.employer} size={32} className="mt-0.5" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold leading-snug text-slate-900">{role.title ?? 'Role'}</p>
        {stint.employer && <p className="text-sm leading-snug text-slate-600">{stint.employer}</p>}
        <p className="mt-0.5 text-xs text-slate-400">
          {formatRange(role.start_date, role.end_date, role.is_current)}
          {role.months != null && ` · ${formatDuration(role.months)}`}
        </p>
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
        <p className="text-sm font-semibold leading-snug text-slate-900">{stint.employer ?? 'Employer'}</p>
        <p className="text-xs text-slate-400">
          {formatRange(stint.startDate, stint.endDate, stint.isCurrent)}
          {stint.months != null && ` · ${formatDuration(stint.months)}`}
        </p>
        <ol className="mt-2 space-y-2.5 border-l border-slate-200 pl-4">
          {stint.roles.map((role, i) => (
            <li key={i} className="relative">
              <span className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full border border-slate-300 bg-white" />
              <div className="flex flex-wrap items-center gap-1.5">
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
              <p className="text-xs text-slate-400">
                {formatRange(role.start_date, role.end_date, role.is_current)}
                {role.months != null && ` · ${formatDuration(role.months)}`}
              </p>
              {role.location && <p className="text-xs text-slate-400">{role.location}</p>}
              {role.summary && <p className="mt-1 text-xs leading-relaxed text-slate-600">{role.summary}</p>}
            </li>
          ))}
        </ol>
      </div>
    </div>
  )
}

export function ExperienceTimeline({ roles, now = new Date() }: { roles: WorkRole[]; now?: Date }) {
  if (!roles.length) return null
  const stints = groupByEmployer(roles, now)
  const { totalMonths, averageTenureMonths } = summarizeHistory(roles, now)

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
