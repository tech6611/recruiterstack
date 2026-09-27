'use client'

import { X as XIcon } from 'lucide-react'
import { BrandIcon } from '@/components/ui/BrandIcon'
import { SocialIcon } from '@/components/ui/SocialIcon'
import { shortSchoolName, topSchool } from '@/components/candidates/CandidateHeader'
import { profileLinks } from '@/lib/ui/profile-links'

/**
 * The identity block above a profile on a WIDE surface — the pool drawer, and anywhere
 * else a person is shown at full width. Juicebox's header, in its order:
 *
 *     Name                                        [in] [gh] [X] [site]
 *     City, Region, Country
 *     [logo] Current employer    [logo] Most recent school
 *
 * FIXED FOR EVERY CANDIDATE, which is the whole reason it is a block and not a
 * paragraph. The same four things in the same places means a recruiter recognises the
 * shape and reads only what differs. A header assembled per-candidate out of whatever
 * happens to be present is just a sentence with logos in it.
 *
 * It shares `topSchool` and `shortSchoolName` with the narrow rail header on the ATS
 * profile, so both surfaces name the same school the same way. Only the LAYOUT differs
 * between them: a 256px rail stacks and centres, a drawer runs across.
 *
 * A LINE IS OMITTED WHEN WE HAVE NOTHING, never rendered as a dash or a greyed icon.
 * The one exception is the employer/school row, which keeps its place with a muted note
 * when both are missing — that row is where the eye goes, and a silently absent row
 * shifts everything below it.
 */

export interface ProfileIdentityProps {
  name: string
  /** Already formatted "City, Region, Country" — the caller knows its own fields. */
  location?: string | null
  currentCompany?: string | null
  education?: { school?: string | null; year?: number | null }[] | null
  /** Contact rows in trust order; the first of each network wins. */
  contacts?: { kind?: string | null; value?: string | null }[] | null
  /** Shown in place of the link row when contacts are withheld behind an unlock. */
  lockedNote?: string | null
  onClose?: () => void
}

export function ProfileIdentity({
  name,
  location,
  currentCompany,
  education,
  contacts,
  lockedNote,
  onClose,
}: ProfileIdentityProps) {
  const school = topSchool(education)
  const links = profileLinks(contacts)

  return (
    <div className="mb-5">
      <div className="flex items-start justify-between gap-4">
        <h2 className="min-w-0 text-xl font-semibold leading-tight text-slate-900">{name}</h2>

        <div className="flex shrink-0 items-center gap-0.5">
          {links.map((l) => (
            <a
              key={l.network}
              href={l.href}
              title={l.label}
              aria-label={l.label}
              target={l.network === 'email' || l.network === 'phone' ? undefined : '_blank'}
              rel="noopener noreferrer"
              className="rounded-lg p-1.5 transition-colors hover:bg-slate-100"
            >
              <SocialIcon network={l.network} />
            </a>
          ))}
          {!links.length && lockedNote && (
            <span className="text-[11px] text-slate-400">{lockedNote}</span>
          )}
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="ml-1 rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
            >
              <XIcon className="h-5 w-5" />
            </button>
          )}
        </div>
      </div>

      {location && <p className="mt-0.5 text-sm text-slate-500">{location}</p>}

      <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-sm text-slate-700">
        {currentCompany && (
          <span className="flex min-w-0 items-center gap-1.5" title={`Current company — ${currentCompany}`}>
            <BrandIcon name={currentCompany} size={18} />
            <span className="truncate font-medium">{currentCompany}</span>
          </span>
        )}
        {school && (
          <span className="flex min-w-0 items-center gap-1.5" title={`Most recent qualification — ${school}`}>
            <BrandIcon name={school} kind="school" size={18} />
            <span className="truncate font-medium">{shortSchoolName(school)}</span>
          </span>
        )}
        {!currentCompany && !school && (
          <span className="text-xs text-slate-400">No employer or school on file</span>
        )}
      </div>
    </div>
  )
}
