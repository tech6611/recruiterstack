import type { SupabaseClient } from '@supabase/supabase-js'
import type { Candidate, Database, Person, PersonInsert } from '@/lib/types/database'

type Supabase = SupabaseClient<Database>

export type PersonSource = 'candidate_record' | 'manual'

export interface CanonicalPerson {
  id: string
  orgId: string
  source: PersonSource
  name: string
  email: string
  phone: string | null
  linkedinUrl: string | null
}

export interface PersonInput {
  name: string
  email: string
  phone?: string | null
  linkedinUrl?: string | null
}

function toCanonical(person: Person, source: PersonSource = 'candidate_record'): CanonicalPerson {
  return {
    id: person.id,
    orgId: person.org_id,
    source,
    name: person.name,
    email: person.email,
    phone: person.phone,
    linkedinUrl: person.linkedin_url,
  }
}

export async function getPersonById(
  supabase: Supabase,
  orgId: string,
  id: string,
): Promise<CanonicalPerson | null> {
  const { data, error } = await supabase
    .from('people')
    .select('*')
    .eq('org_id', orgId)
    .eq('id', id)
    .maybeSingle()

  if (error) throw error
  return data ? toCanonical(data as Person) : null
}

export async function findPersonByEmail(
  supabase: Supabase,
  orgId: string,
  email: string,
): Promise<CanonicalPerson | null> {
  const { data, error } = await supabase
    .from('people')
    .select('*')
    .eq('org_id', orgId)
    .eq('email', email)
    .maybeSingle()

  if (error) throw error
  return data ? toCanonical(data as Person) : null
}

export async function findOrCreatePerson(
  supabase: Supabase,
  orgId: string,
  input: PersonInput,
  source: PersonSource = 'candidate_record',
): Promise<CanonicalPerson> {
  const existing = await findPersonByEmail(supabase, orgId, input.email)
  if (existing) return existing

  const row: PersonInsert = {
    org_id: orgId,
    name: input.name,
    email: input.email,
    phone: input.phone ?? null,
    linkedin_url: input.linkedinUrl ?? null,
  }

  const { data, error } = await supabase
    .from('people')
    .insert(row as never)
    .select('*')
    .single()

  // Tolerate a concurrent insert racing the UNIQUE(org_id, email) constraint.
  if (error) {
    const raced = await findPersonByEmail(supabase, orgId, input.email)
    if (raced) return raced
    throw error
  }

  return toCanonical(data as Person, source)
}

// Back-compat: derive a canonical person view from a candidate row. Prefer the
// table-backed helpers above for new code.
export function personFromCandidate(candidate: Candidate): CanonicalPerson {
  return {
    id: candidate.person_id ?? candidate.id,
    orgId: candidate.org_id,
    source: 'candidate_record',
    name: candidate.name,
    email: candidate.email,
    phone: candidate.phone,
    linkedinUrl: candidate.linkedin_url,
  }
}
