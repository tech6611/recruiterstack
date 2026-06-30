import Anthropic from '@anthropic-ai/sdk'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'
import { findOrCreateCandidateProfile } from '@/modules/ats/domain/candidates'

/**
 * Sourcing (Scout) facade: CSV → parsed candidates → canonical candidate
 * profiles. Shared by /api/sourcing/import + /api/sourcing/confirm and the
 * copilot `import_candidates_csv` tool so all three use one parse + write path.
 */

type Supabase = SupabaseClient<Database>

export interface ParsedCandidate {
  name?:             string
  email?:            string
  phone?:            string
  current_title?:    string
  location?:         string
  experience_years?: number
  skills?:           string[]
  linkedin_url?:     string
}

export class SourcingError extends Error {
  status: number
  constructor(message: string, status = 500) {
    super(message)
    this.name = 'SourcingError'
    this.status = status
  }
}

/** AI-parse raw CSV text into candidate rows (Claude Haiku). Keeps only rows
 *  with at least a name or email; caps at 100. */
export async function parseCandidatesCsv(csvText: string): Promise<ParsedCandidate[]> {
  if (!csvText?.trim()) throw new SourcingError('csv_text is required', 400)
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new SourcingError('ANTHROPIC_API_KEY not configured', 503)

  const client = new Anthropic({ apiKey })
  const prompt = `Parse this CSV data and extract candidate information. Map columns intelligently — handle any header naming convention (e.g. "Full Name", "name", "candidate_name" all map to "name").

Extract these fields per row (all optional, but each row must have at least one of name or email):
- name: full name
- email: email address
- phone: phone number
- current_title: current job title / role
- location: city, country, or region
- experience_years: years of experience as a number (0 if unknown or not present)
- skills: array of skill keywords (parse from a skills/technologies column; if none, infer 1-2 from the title)
- linkedin_url: LinkedIn profile URL if present

Rules:
- Skip rows where both name AND email are empty/missing
- experience_years must be a number, not a string
- For skills: if there's a dedicated column, split on commas/semicolons/pipes. Otherwise infer from title.
- Return ONLY a valid JSON array with no explanation: [{"name":"...","email":"...",...}]
- Omit null/empty fields from each object
- Maximum 100 candidates

CSV data:
${csvText.slice(0, 10000)}`

  let message
  try {
    message = await client.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 4096,
      messages:   [{ role: 'user', content: prompt }],
    })
  } catch {
    throw new SourcingError('CSV parsing failed — check your API key and CSV format', 500)
  }

  const raw  = message.content[0]?.type === 'text' ? message.content[0].text.trim() : ''
  const json = raw.startsWith('[') ? raw : (raw.match(/\[[\s\S]*\]/)?.[0] ?? '[]')
  let candidates: unknown
  try { candidates = JSON.parse(json) } catch { throw new SourcingError('Could not parse CSV — no candidate data found', 422) }
  if (!Array.isArray(candidates)) throw new SourcingError('Could not parse CSV — no candidate data found', 422)

  return (candidates as ParsedCandidate[]).filter(c => c.name?.trim() || c.email?.trim())
}

export interface ImportResult {
  created: number
  skipped: number
  errors: string[]
}

/** Create canonical candidate profiles from parsed rows. Rows without an email
 *  can't be deduped, so they're skipped. Mirrors /api/sourcing/confirm. */
export async function createCandidatesFromParsed(
  supabase: Supabase,
  orgId: string,
  candidates: ParsedCandidate[],
): Promise<ImportResult> {
  let created = 0, skipped = 0
  const errors: string[] = []

  for (const c of candidates) {
    const email = c.email?.toLowerCase().trim() ?? ''
    if (!email) { skipped += 1; continue }
    try {
      const result = await findOrCreateCandidateProfile(supabase, orgId, {
        name:             (c.name ?? email).trim(),
        email,
        phone:            c.phone?.trim()         ?? null,
        current_title:    c.current_title?.trim() ?? null,
        location:         c.location?.trim()      ?? null,
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

  return { created, skipped, errors }
}
