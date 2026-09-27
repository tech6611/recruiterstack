'use client'

import { ExternalLink, FileText, Linkedin, Mail, MapPin, Phone } from 'lucide-react'
import { BrandIcon } from '@/components/ui/BrandIcon'
import { PersonAvatar } from '@/components/ui/PersonAvatar'
import { isPoolPlaceholderEmail } from '@/lib/pool-email'
import type { Candidate } from '@/lib/types/database'

/**
 * The identity block at the top of a candidate profile, in Juicebox's order: name, then
 * where they are, then the two marks that place them — current employer and school —
 * then the ways to reach them.
 *
 * THE CHIPS ARE THE POINT. A recruiter scanning a profile recognises "Figma" and
 * "UMass Amherst" as logos long before reading either word, which is why Juicebox puts
 * them directly under the name. Both come straight from data we already hold:
 * `current_company` on the candidate row, and the most recent qualification in
 * `education`.
 *
 * WHAT WE SHOW FEWER OF THAN JUICEBOX, AND WHY. Their header carries a row of source
 * icons — LinkedIn, GitHub, X, personal site, about.me — because their profiles are
 * assembled from those sources. An ATS candidate arrives with a CV, so the honest set
 * is LinkedIn, résumé, email and phone. A link is rendered only when we hold it; a
 * greyed-out icon for something we do not have is noise pretending to be a feature.
 */

/**
 * Shorten an institution for the chip, the way Juicebox does ("U of Virginia").
 *
 * A 256px rail truncates "Indian Institute of Technology, Guwahati" to "Indian
 * Institute of Technology, Guw…", which hides the only part that identifies it — the
 * campus. The abbreviations below are how these institutions are actually referred to,
 * so the short form is more recognisable than the long one, not merely smaller.
 *
 * Display only. The full name is what gets resolved to a logo and what the tooltip says.
 */
export function shortSchoolName(name: string): string {
  const n = name.trim()
  const campus = (re: RegExp, prefix: string) => {
    const m = n.match(re)
    return m ? `${prefix} ${m[1].replace(/^[,\s]+/, '').split(',')[0].trim()}` : null
  }
  return (
    campus(/indian institute of technology[,\s]+(.+)$/i, 'IIT') ??
    campus(/indian institute of management[,\s]+(.+)$/i, 'IIM') ??
    campus(/national institute of technology[,\s]+(.+)$/i, 'NIT') ??
    campus(/indian institute of information technology[,\s]+(.+)$/i, 'IIIT') ??
    n
      // "The" first: "The University of Texas" only matches the second rule once the
      // article is gone.
      .replace(/^the\s+/i, '')
      .replace(/^university of\s+/i, 'U of ')
      .split(',')[0]
      .trim()
  )
}

/** Most recent qualification: the school worth putting beside the employer. */
function topSchool(education: Candidate['education']): string | null {
  const entries = (education ?? []).filter((e) => e?.school)
  if (!entries.length) return null
  const dated = entries.filter((e) => typeof e.year === 'number')
  const best = dated.length
    ? dated.reduce((a, b) => ((b.year as number) > (a.year as number) ? b : a))
    : entries[0]
  return best.school ?? null
}

function LinkIcon({
  href, label, icon: Icon, external = true,
}: {
  href: string
  label: string
  icon: typeof Mail
  external?: boolean
}) {
  return (
    <a
      href={href}
      title={label}
      aria-label={label}
      {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
      className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
    >
      <Icon className="h-4 w-4" />
    </a>
  )
}

export function CandidateHeader({ candidate }: { candidate: Candidate }) {
  const school = topSchool(candidate.education)
  const hasEmail = candidate.email && !isPoolPlaceholderEmail(candidate.email)

  return (
    <div className="flex flex-col items-center text-center">
      <PersonAvatar name={candidate.name} src={candidate.avatar_url} size={64} className="mb-3" />

      <h1 className="text-lg font-bold leading-tight text-slate-900">{candidate.name}</h1>
      {candidate.current_title && (
        <p className="mt-0.5 text-sm leading-snug text-slate-500">{candidate.current_title}</p>
      )}
      {candidate.location && (
        <p className="mt-1 inline-flex items-center gap-1 text-xs text-slate-400">
          <MapPin className="h-3 w-3 shrink-0" />
          <span className="truncate">{candidate.location}</span>
        </p>
      )}

      {/* The two marks that place someone at a glance.

          No chip, no border, no fill. Juicebox sets these as a mark followed by its
          name, sitting on the page — and it is right: a frame around a logo is a second
          box competing with whatever box the logo already is. An earlier version put
          each in a bordered pill, which is what made Plivo look stuffed into a square
          even after the icon itself stopped drawing its own tile. */}
      {(candidate.current_company || school) && (
        <div className="mt-2.5 flex w-full flex-col items-start gap-1.5 text-xs text-slate-600">
          {candidate.current_company && (
            <span className="flex min-w-0 max-w-full items-center gap-1.5" title={`Current company — ${candidate.current_company}`}>
              <BrandIcon name={candidate.current_company} size={16} />
              <span className="truncate font-medium">{candidate.current_company}</span>
            </span>
          )}
          {school && (
            <span className="flex min-w-0 max-w-full items-center gap-1.5" title={`Most recent qualification — ${school}`}>
              <BrandIcon name={school} kind="school" size={16} />
              <span className="truncate font-medium">{shortSchoolName(school)}</span>
            </span>
          )}
        </div>
      )}

      {/* Only the links we actually hold. */}
      <div className="mt-2 flex items-center justify-center gap-0.5">
        {hasEmail && <LinkIcon href={`mailto:${candidate.email}`} label={candidate.email} icon={Mail} external={false} />}
        {candidate.phone && <LinkIcon href={`tel:${candidate.phone}`} label={candidate.phone} icon={Phone} external={false} />}
        {candidate.linkedin_url && <LinkIcon href={candidate.linkedin_url} label="LinkedIn profile" icon={Linkedin} />}
        {candidate.resume_url && (
          <LinkIcon href={`/api/candidates/${candidate.id}/resume`} label="Résumé" icon={FileText} />
        )}
        {!hasEmail && !candidate.phone && !candidate.linkedin_url && !candidate.resume_url && (
          <span className="inline-flex items-center gap-1 py-1 text-[11px] text-slate-400">
            <ExternalLink className="h-3 w-3" /> No contact details on file
          </span>
        )}
      </div>
    </div>
  )
}
