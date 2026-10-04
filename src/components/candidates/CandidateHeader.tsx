'use client'

import { useEffect, useState } from 'react'
import { MapPin } from 'lucide-react'
import { BrandIcon } from '@/components/ui/BrandIcon'
import { PersonAvatar } from '@/components/ui/PersonAvatar'
import { SocialIcon } from '@/components/ui/SocialIcon'
import { profileLinks } from '@/lib/ui/profile-links'
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
 * THE LINK ROW is Juicebox's too: the person's public profiles (LinkedIn, GitHub, X,
 * personal site) in brand colours. Email, phone and résumé used to sit here as grey
 * icons, but each was already in the contact list directly below — the row now says
 * something the rest of the rail does not. A link is rendered only when we hold it.
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

/**
 * Most recent qualification: the school worth putting beside the employer.
 *
 * Structural over `Candidate['education']` on purpose — the pool drawer holds the same
 * four fields under a different type, and both headers have to pick the same school or
 * the two surfaces describe one person differently.
 */
export function topSchool(
  education: { school?: string | null; year?: number | null }[] | null | undefined,
): string | null {
  const entries = (education ?? []).filter((e) => e?.school)
  if (!entries.length) return null
  const dated = entries.filter((e) => typeof e.year === 'number')
  const best = dated.length
    ? dated.reduce((a, b) => ((b.year as number) > (a.year as number) ? b : a))
    : entries[0]
  return best.school ?? null
}

/**
 * Contact rows for the link row: the candidate's own LinkedIn straight away, then
 * whatever else we know them by (GitHub, personal site, X) once the links route answers.
 * A failed fetch leaves the LinkedIn-only row in place — never an error in the header.
 */
function useProfileContacts(candidate: Candidate) {
  const own = candidate.linkedin_url ? [{ kind: 'linkedin', value: candidate.linkedin_url }] : []
  const [fetched, setFetched] = useState<{ kind: string; value: string }[] | null>(null)

  useEffect(() => {
    let live = true
    setFetched(null)
    fetch(`/api/candidates/${candidate.id}/links`)
      .then(r => (r.ok ? r.json() : null))
      .then(j => { if (live && Array.isArray(j?.links)) setFetched(j.links) })
      .catch(() => {})
    return () => { live = false }
    // A LinkedIn edit in the contact list re-fetches so the two never disagree.
  }, [candidate.id, candidate.linkedin_url])

  return fetched ?? own
}

export function CandidateHeader({ candidate }: { candidate: Candidate }) {
  const school = topSchool(candidate.education)
  const links = profileLinks(useProfileContacts(candidate))

  return (
    <div className="flex flex-col items-center text-center">
      <PersonAvatar name={candidate.name} src={candidate.avatar_url} size={64} className="mb-3" />

      <h1 className="text-lg font-bold leading-tight text-slate-900">{candidate.name}</h1>

      {/* Title and location always take the same two slots, so every profile has the
          same shape: a missing value shows as a quiet placeholder rather than the rows
          below jumping up. `text-balance` keeps a wrapped title in two even lines —
          without it "Software Development Engineer 2" leaves the "2" alone on a line. */}
      <p
        className={`mt-1 line-clamp-2 text-balance text-sm leading-snug ${candidate.current_title ? 'text-slate-500' : 'italic text-slate-300'}`}
        title={candidate.current_title ?? undefined}
      >
        {candidate.current_title || 'No title on file'}
      </p>
      <p className={`mt-1 flex max-w-full items-center justify-center gap-1 text-xs ${candidate.location ? 'text-slate-400' : 'italic text-slate-300'}`}>
        <MapPin className="h-3 w-3 shrink-0" />
        <span className="truncate">{candidate.location || 'Location not on file'}</span>
      </p>

      {/* The two marks that place someone at a glance — centred on the same axis as
          everything above them, so a short name (Plivo) and a long one (MindTickle
          Interactive Media…) sit in the same place.

          No chip, no border, no fill. Juicebox sets these as a mark followed by its
          name, sitting on the page — a frame around a logo is a second box competing
          with whatever box the logo already is. */}
      {(candidate.current_company || school) && (
        <div className="mt-2.5 flex w-full flex-col items-center gap-1.5 text-xs text-slate-600">
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

      {/* Where else this person lives online — LinkedIn, GitHub, X, a personal site —
          in their own colours, the way Juicebox opens a profile. Email, phone and the
          résumé are not repeated here: the contact list below and the Resume tab
          already carry them. Only links we hold; no row at all when there are none. */}
      {links.length > 0 && (
        <div className="mt-2.5 flex items-center justify-center gap-0.5">
          {links.map(l => (
            <a
              key={l.network}
              href={l.href}
              title={l.label}
              aria-label={l.label}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg p-1.5 transition-colors hover:bg-slate-100"
            >
              <SocialIcon network={l.network} />
            </a>
          ))}
        </div>
      )}
    </div>
  )
}
