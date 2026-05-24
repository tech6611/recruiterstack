import type { SupabaseClient } from '@supabase/supabase-js'
import type { Candidate, CandidateInsert, Database } from '@/lib/types/database'
import { findOrCreatePerson } from '@/lib/domain/people'

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
  const { data, error } = await supabase
    .from('candidates')
    .select('id')
    .eq('org_id', orgId)
    .eq('email', email)
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

  const row: CandidateInsert = {
    org_id: orgId,
    person_id: person.id,
    name: input.name,
    email: input.email,
    phone: input.phone ?? null,
    resume_url: input.resume_url ?? null,
    current_title: input.current_title ?? null,
    location: input.location ?? null,
    linkedin_url: input.linkedin_url ?? null,
    skills: input.skills ?? [],
    experience_years: input.experience_years ?? 0,
    status: 'active',
  }

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
