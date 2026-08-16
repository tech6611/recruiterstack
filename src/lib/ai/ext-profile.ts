/**
 * Turn a LinkedIn profile the recruiter is viewing (captured by the browser
 * extension) into the two things the Fit Engine needs: a structured candidate
 * object (for the gates + judge header) and a free-text profile blurb (the About
 * + experience narrative, which the structured fields don't capture). Pure +
 * unit-tested — the extension does the DOM reading; this just normalizes it.
 */

export interface ScrapedProfile {
  name: string
  /** LinkedIn headline — used as the current title. */
  headline?: string | null
  location?: string | null
  /** The free-text "About" section. */
  about?: string | null
  /** Experience entries as short lines, e.g. "Senior PM at Acme (2019–2024)". */
  experience?: string[] | null
  skills?: string[] | null
}

/** The subset of candidate fields the Fit Engine reads (see fit-engine.ts). */
export interface FitCandidateInput {
  name: string
  current_title: string | null
  location: string | null
  skills: string[]
  experience_years: number | null
}

/**
 * Map a scraped profile onto the candidate fields the Fit Engine uses. We
 * deliberately leave experience_years null unless it's confidently known — the
 * gates never fail on absent data, so an unknown never counts against someone.
 */
export function buildFitCandidate(p: ScrapedProfile): FitCandidateInput {
  return {
    name: (p.name || '').trim() || 'Candidate',
    current_title: clean(p.headline),
    location: clean(p.location),
    skills: (p.skills ?? []).map((s) => s.trim()).filter(Boolean),
    experience_years: null,
  }
}

/**
 * Assemble the free-text blurb passed to the judge as <profile_details>. Returns
 * an empty string when there's nothing beyond the structured fields, so the judge
 * prompt omits the block entirely.
 */
export function buildProfileText(p: ScrapedProfile): string {
  const parts: string[] = []
  const about = clean(p.about)
  if (about) parts.push(`About:\n${about}`)

  const exp = (p.experience ?? []).map((e) => e.trim()).filter(Boolean)
  if (exp.length) parts.push(`Experience:\n${exp.map((e) => `- ${e}`).join('\n')}`)

  const skills = (p.skills ?? []).map((s) => s.trim()).filter(Boolean)
  if (skills.length) parts.push(`Skills: ${skills.join(', ')}`)

  return parts.join('\n\n')
}

function clean(v: string | null | undefined): string | null {
  const t = (v ?? '').trim()
  return t.length ? t : null
}
