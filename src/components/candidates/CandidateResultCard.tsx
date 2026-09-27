'use client'

import { FileText, Linkedin, MapPin, Sparkles } from 'lucide-react'
import { BrandIcon } from '@/components/ui/BrandIcon'
import { PersonAvatar } from '@/components/ui/PersonAvatar'
import { formatRange } from '@/lib/ui/work-history'
import type { CandidateListItem } from '@/lib/types/database'

/**
 * One candidate as a card you read top to bottom, rather than a table row you read
 * left to right — the shape Juicebox lists results in.
 *
 * WHAT THE CARD BUYS. A table tells you someone's title. A card tells you their last
 * three jobs with the employers' marks, where they studied, and what the assessment
 * concluded — so a shortlist can be judged by scrolling instead of by opening twelve
 * profiles. What it costs is density: a table fits fifteen people on a screen, this
 * fits about four. That is why it is a second view and not a replacement.
 *
 * The current role leads in full weight; earlier roles hang off a rail beneath it,
 * quieter, because they are context rather than the answer to "who is this".
 */

/** "Engineering Manager at Figma" — the line Juicebox leads each role with. */
function roleLine(title: string | null, employer: string | null): string {
  if (title && employer) return `${title} at ${employer}`
  return title || employer || 'Role'
}

export function CandidateResultCard({
  candidate,
  onOpen,
}: {
  candidate: CandidateListItem
  onOpen: () => void
}) {
  const [current, ...earlier] = candidate.experiences ?? []
  const education = (candidate.education ?? []).filter((e) => e?.school || e?.degree)
  const topEducation = education[0]
  const summary = candidate.ai_summary?.trim()

  return (
    <article
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen() } }}
      className="cursor-pointer rounded-xl border border-slate-200 bg-white p-4 transition-colors hover:border-slate-300 hover:bg-slate-50/60"
    >
      <div className="flex gap-3">
        <PersonAvatar name={candidate.name} src={candidate.avatar_url} size={40} />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h3 className="text-sm font-semibold text-slate-900">{candidate.name}</h3>
            {candidate.linkedin_url && (
              <a
                href={candidate.linkedin_url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                title="LinkedIn profile"
                className="text-slate-300 transition-colors hover:text-slate-600"
              >
                <Linkedin className="h-3.5 w-3.5" />
              </a>
            )}
            {candidate.resume_url && (
              <a
                href={`/api/candidates/${candidate.id}/resume`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                title="Résumé"
                className="text-slate-300 transition-colors hover:text-slate-600"
              >
                <FileText className="h-3.5 w-3.5" />
              </a>
            )}
            {candidate.active_applications_count > 0 && (
              <span className="rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">
                {candidate.active_applications_count} job{candidate.active_applications_count === 1 ? '' : 's'}
              </span>
            )}
          </div>

          {candidate.location && (
            <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-400">
              <MapPin className="h-3 w-3 shrink-0" />
              <span className="truncate">{candidate.location}</span>
            </p>
          )}

          {/* Current role in full weight. Falls back to the flat title/company fields
              when the résumé was never broken into a dated history. */}
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
            ) : (candidate.current_title || candidate.current_company) ? (
              <div className="flex items-start gap-2">
                <BrandIcon name={candidate.current_company} size={16} className="mt-0.5" />
                <p className="min-w-0 flex-1 text-sm font-medium leading-snug text-slate-800">
                  {roleLine(candidate.current_title, candidate.current_company)}
                </p>
              </div>
            ) : null}

            {/* Earlier roles: context, so they sit quieter and indented. */}
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
                  {topEducation.school ? `${topEducation.degree || topEducation.field ? ' at ' : ''}${topEducation.school}` : ''}
                </p>
              </div>
            )}
          </div>

          {summary && (
            <p className="mt-2.5 flex gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-600">
              <Sparkles className="mt-0.5 h-3 w-3 shrink-0 text-slate-400" />
              <span className="line-clamp-3">{summary}</span>
            </p>
          )}
        </div>
      </div>
    </article>
  )
}
