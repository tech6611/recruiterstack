import type { SupabaseClient } from '@supabase/supabase-js'
import type { Candidate, CandidateInsert, Database } from '@/lib/types/database'
import { findOrCreatePerson } from '@/modules/core/domain/people'

type Supabase = SupabaseClient<Database>

export interface CandidateProfileInput {
  name: string
  email: string
  phone?: string | null
  resume_url?: string | null
  current_title?: string | null
  location?: string | null
  linkedin_url?: string | null
  skills?: string[]
  experience_years?: number
}

export async function findCandidateByEmailForOrg(
  supabase: Supabase,
  orgId: string,
  email: string,
): Promise<Pick<Candidate, 'id'> | null> {
  // Identity (email) lives canonically on `people`; candidates table no longer
  // holds it. Resolve the person first, then look up the candidate by person_id.
  const { data: person, error: personErr } = await supabase
    .from('people')
    .select('id')
    .eq('org_id', orgId)
    .eq('email', email)
    .maybeSingle()
  if (personErr) throw personErr
  if (!person) return null

  const { data, error } = await supabase
    .from('candidates')
    .select('id')
    .eq('org_id', orgId)
    .eq('person_id', (person as { id: string }).id)
    .maybeSingle()

  if (error) throw error
  return data as Pick<Candidate, 'id'> | null
}

export async function createCandidateProfile(
  supabase: Supabase,
  orgId: string,
  input: CandidateProfileInput,
): Promise<Pick<Candidate, 'id'>> {
  // Resolve the canonical Person first so the profile links to one durable
  // human record (identity is owned by `people`, profile lives on `candidates`).
  const person = await findOrCreatePerson(supabase, orgId, {
    name: input.name,
    email: input.email,
    phone: input.phone ?? null,
    linkedinUrl: input.linkedin_url ?? null,
  })

  // Identity fields (name / email / phone / linkedin_url) live ONLY on `people`
  // post-Party-Model cleanup (migration 062). The BEFORE INSERT trigger on
  // candidates fills any NULL identity values from the linked people row, so
  // we no longer pass them here. Cast is needed because the CandidateInsert
  // type still requires them — a follow-up slice updates types/database.ts
  // to make them optional once the WhatsApp branch merges.
  const row = {
    org_id: orgId,
    person_id: person.id,
    resume_url: input.resume_url ?? null,
    current_title: input.current_title ?? null,
    location: input.location ?? null,
    skills: input.skills ?? [],
    experience_years: input.experience_years ?? 0,
    status: 'active' as const,
  } as unknown as CandidateInsert

  const { data, error } = await supabase
    .from('candidates')
    .insert(row as never)
    .select('id')
    .single()

  if (error) throw error
  return data as Pick<Candidate, 'id'>
}

export async function findOrCreateCandidateProfile(
  supabase: Supabase,
  orgId: string,
  input: CandidateProfileInput,
): Promise<Pick<Candidate, 'id'> & { created: boolean }> {
  const existing = await findCandidateByEmailForOrg(supabase, orgId, input.email)
  if (existing) return { ...existing, created: false }

  const created = await createCandidateProfile(supabase, orgId, input)
  return { ...created, created: true }
}
