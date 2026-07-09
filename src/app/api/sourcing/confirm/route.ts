import { NextResponse } from 'next/server'
import { withCapability } from '@/lib/api/helpers'
import { findOrCreateCandidateProfile } from '@/modules/ats/domain/candidates'

type ParsedCandidate = {
  name?:             string
  email?:            string
  phone?:            string
  current_title?:    string
  current_company?:  string
  location?:         string
  experience_years?: number
  skills?:           string[]
  linkedin_url?:     string
}

// POST /api/sourcing/confirm
// Body: { candidates: ParsedCandidate[] }
// Returns: { created: number, skipped: number, errors: string[] }
//
// Post-Party-Model cleanup: each row goes through findOrCreateCandidateProfile,
// which creates the canonical people row first and then the candidate. We lose
// the previous chunked bulk-insert optimization, but sourcing is admin-triggered
// (one CSV at a time, dozens to a few hundred rows), so the round-trip cost is
// fine for the architectural win of one write path.
export const POST = withCapability('recruiting:edit', async (request, orgId, supabase) => {
  let body: { candidates: ParsedCandidate[] }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { candidates } = body
  if (!Array.isArray(candidates) || candidates.length === 0) {
    return NextResponse.json({ error: 'candidates array is required' }, { status: 400 })
  }

  let created = 0, skipped = 0
  const errors: string[] = []

  for (const c of candidates) {
    const email = c.email?.toLowerCase().trim() ?? ''
    if (!email) {
      // No-email rows can't dedupe — skip them. (Old behaviour was to always
      // insert; post-cleanup, we need an identity anchor on people.)
      skipped += 1
      continue
    }
    try {
      const result = await findOrCreateCandidateProfile(supabase, orgId, {
        name:             (c.name ?? email).trim(),
        email,
        phone:            c.phone?.trim()           ?? null,
        current_title:    c.current_title?.trim()   ?? null,
        current_company:  c.current_company?.trim() ?? null,
        location:         c.location?.trim()        ?? null,
        linkedin_url:     c.linkedin_url?.trim()  ?? null,
        skills:           Array.isArray(c.skills) ? c.skills : [],
        experience_years: typeof c.experience_years === 'number' ? c.experience_years : 0,
      })
      if (result.created) created += 1
      else                skipped += 1
    } catch (err) {
      errors.push(`${c.name ?? email}: ${err instanceof Error ? err.message : 'unknown error'}`)
    }
  }

  return NextResponse.json({ created, skipped, errors })
})
