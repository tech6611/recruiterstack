'use client'

import type { ReactNode } from 'react'
import { MapPin, Sparkles } from 'lucide-react'
import { BrandIcon } from '@/components/ui/BrandIcon'
import { PersonAvatar } from '@/components/ui/PersonAvatar'
import { formatRange } from '@/lib/ui/work-history'

/**
 * One person as a card read top to bottom — the shape Juicebox lists results in, and
 * the one thing the ATS candidate list and the pool browser must not draw differently.
 *
 * Presentational and deliberately neutral about WHOSE person this is: the candidate
 * list and the pool hold different records with different affordances (one has active
 * applications and a résumé, the other has an unlock price and an evidence date), so
 * each passes its own `badges` and `links` and this draws the part they share. Writing
 * the markup twice is how the two surfaces ended up describing the same human
 * differently in the first place.
 */
export interface ResultCardRole {
  title: string | null
  employer: string | null
  start_date: string | null
  end_date: string | null
  is_current: boolean
}

export interface ResultCardPerson {
  name: string
  photoUrl?: string | null
  location?: string | null
  /** Used when there is no dated history to show — the flat current title/company. */
  currentTitle?: string | null
  currentCompany?: string | null
  /** Most recent first. The first is drawn in full weight, the rest on a quiet rail. */
  roles?: ResultCardRole[]
  education?: { degree?: string | null; field?: string | null; school?: string | null }[]
  summary?: string | null
}

/** "Engineering Manager at Figma" — the line Juicebox leads each role with. */
function roleLine(title: string | null | undefined, employer: string | null | undefined): string {
  if (title && employer) return `${title} at ${employer}`
  return title || employer || 'Role'
}

export function ResultCard({
  person,
  badges,
  links,
  footer,
  onOpen,
}: {
  person: ResultCardPerson
  /** Status pills, freshness, "in your ATS" — whatever this surface needs said. */
  badges?: ReactNode
  /** Icon links beside the name. */
  links?: ReactNode
  /** Actions along the bottom, e.g. the pool's unlock button. */
  footer?: ReactNode
  onOpen: () => void
}) {
  const [current, ...earlier] = person.roles ?? []
  const topEducation = (person.education ?? []).find((e) => e?.school || e?.degree)

  return (
    <article
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen() } }}
      className="cursor-pointer rounded-xl border border-slate-200 bg-white p-4 text-left transition-colors hover:border-slate-300 hover:bg-slate-50/60"
    >
      <div className="flex gap-3">
        <PersonAvatar name={person.name} src={person.photoUrl} size={40} />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h3 className="text-sm font-semibold text-slate-900">{person.name}</h3>
            {links}
            {badges}
          </div>

          {person.location && (
            <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-400">
              <MapPin className="h-3 w-3 shrink-0" />
              <span className="truncate">{person.location}</span>
            </p>
          )}

          <div className="mt-2.5 space-y-1.5">
            {current ? (
              <div className="flex items-start gap-2">
                <BrandIcon name={current.employer} size={16} className="mt-0.5" />
                <p className="min-w-0 flex-1 text-sm leading-snug text-slate-800">
                  <span className="font-medium">{roleLine(current.title, current.employer)}</span>
                  <span className="ml-1.5 whitespace-nowrap text-xs text-slate-400">
                    {formatRange(current.start_date, current.end_date, current.is_current)}
                  </span>
                </p>
              </div>
            ) : (person.currentTitle || person.currentCompany) ? (
              <div className="flex items-start gap-2">
                <BrandIcon name={person.currentCompany} size={16} className="mt-0.5" />
                <p className="min-w-0 flex-1 text-sm font-medium leading-snug text-slate-800">
                  {roleLine(person.currentTitle, person.currentCompany)}
                </p>
              </div>
            ) : null}

            {/* Earlier roles are context, so they sit quieter and indented. */}
            {earlier.map((role, i) => (
              <div key={i} className="flex items-start gap-2 pl-[22px]">
                <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full border border-slate-300" />
                <p className="min-w-0 flex-1 text-xs leading-snug text-slate-500">
                  {roleLine(role.title, role.employer)}
                  <span className="ml-1.5 whitespace-nowrap text-slate-400">
                    {formatRange(role.start_date, role.end_date, role.is_current)}
                  </span>
                </p>
              </div>
            ))}

            {topEducation && (
              <div className="flex items-start gap-2">
                <BrandIcon name={topEducation.school} kind="school" size={16} className="mt-0.5" />
                <p className="min-w-0 flex-1 text-xs leading-snug text-slate-500">
                  {[topEducation.degree, topEducation.field].filter(Boolean).join(', ')}
                  {topEducation.school
                    ? `${topEducation.degree || topEducation.field ? ' at ' : ''}${topEducation.school}`
                    : ''}
                </p>
              </div>
            )}
          </div>

          {person.summary && (
            <p className="mt-2.5 flex gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-600">
              <Sparkles className="mt-0.5 h-3 w-3 shrink-0 text-slate-400" />
              <span className="line-clamp-3">{person.summary}</span>
            </p>
          )}

          {footer && <div className="mt-2.5 flex flex-wrap items-center gap-2">{footer}</div>}
        </div>
      </div>
    </article>
  )
}
