import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js'
import type {
  Candidate,
  CandidateInsert,
  CandidateStatus,
  Database,
} from '@/lib/types/database'
import { findOrCreatePerson } from '@/modules/core/domain/people'

type Supabase = SupabaseClient<Database>

export interface CandidateProfileInput {
  name: string
  email: string
  phone?: string | null
  resume_url?: string | null
  current_title?: string | null
  current_company?: string | null
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
    current_company: input.current_company ?? null,
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

// ---------------------------------------------------------------------------
// Slice 2 — WRITE/READ facade for callers in job-handlers.ts & copilot-tools.ts
// ---------------------------------------------------------------------------

export async function getCandidateForSummary(
  supabase: Supabase,
  orgId: string,
  candidateId: string,
): Promise<Candidate> {
  const { data, error } = await supabase
    .from('candidates')
    .select('*')
    .eq('id', candidateId)
    .eq('org_id', orgId)
    .single()

  if (error || !data) {
    throw new Error('Candidate not found')
  }
  return data as Candidate
}

export async function saveCandidateAiSummary(
  supabase: Supabase,
  orgId: string,
  candidateId: string,
  summary: string,
): Promise<void> {
  const { error } = await supabase
    .from('candidates')
    .update({
      ai_summary: summary,
      ai_summary_generated_at: new Date().toISOString(),
    } as never)
    .eq('id', candidateId)
    .eq('org_id', orgId)

  if (error) throw new Error(`Failed to save summary: ${error.message}`)
}

export async function listCandidatesForOrg(
  supabase: Supabase,
  orgId: string,
): Promise<Candidate[]> {
  const { data, error } = await supabase
    .from('candidates')
    .select('*')
    .eq('org_id', orgId)

  if (error) throw new Error(`Candidates query failed: ${error.message}`)
  return (data ?? []) as Candidate[]
}

export async function setCandidateStatus(
  supabase: Supabase,
  orgId: string,
  candidateId: string,
  status: CandidateStatus,
): Promise<{ error: PostgrestError | null }> {
  const { error } = await supabase
    .from('candidates')
    .update({ status } as never)
    .eq('id', candidateId)
    .eq('org_id', orgId)
  return { error }
}

export interface AgentCandidateSearchRow {
  id: string
  current_title: string | null
  status: CandidateStatus
  skills: string[] | null
  experience_years: number | null
  location: string | null
  person: { name: string | null; email: string | null } | null
}

export async function searchCandidatesForAgent(
  supabase: Supabase,
  orgId: string,
  opts: { query?: string; status?: string },
): Promise<{ data: AgentCandidateSearchRow[] | null; error: PostgrestError | null }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q: any = supabase
    .from('candidates')
    .select('id, current_title, status, skills, experience_years, location, person:people(name, email)')
    .eq('org_id', orgId)

  if (opts.query) {
    // Name now lives on people; resolve matching person ids first and OR with
    // the candidate-side title filter so the AI agent still gets relevant results.
    const { data: people } = await supabase
      .from('people')
      .select('id')
      .eq('org_id', orgId)
      .ilike('name', `%${opts.query}%`)
      .limit(200)
    const personIds = ((people ?? []) as Array<{ id: string }>).map((p) => p.id)
    const titleClause = `current_title.ilike.%${opts.query}%`
    if (personIds.length > 0) {
      q = q.or(`${titleClause},person_id.in.(${personIds.join(',')})`)
    } else {
      q = q.or(titleClause)
    }
  }
  if (opts.status) q = q.eq('status', opts.status)

  const { data, error } = await q.order('created_at', { ascending: false }).limit(20)
  return { data: data as AgentCandidateSearchRow[] | null, error }
}

export async function countCandidatesByStatus(
  supabase: Supabase,
  orgId: string,
  status: CandidateStatus,
): Promise<number> {
  const { count } = await supabase
    .from('candidates')
    .select('id', { count: 'exact', head: true })
    .eq('org_id', orgId)
    .eq('status', status)
  return count ?? 0
}

export interface AgentCandidateLookupRow {
  id: string
  name: string
  email: string
  phone: string | null
  current_title: string | null
  skills: string[] | null
  experience_years: number | null
  location: string | null
  status: CandidateStatus
  linkedin_url: string | null
}

export async function getCandidateForAgentLookup(
  supabase: Supabase,
  orgId: string,
  opts: { candidateId?: string; nameQuery?: string },
): Promise<{ data: AgentCandidateLookupRow[] | null; error: PostgrestError | null }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q: any = supabase
    .from('candidates')
    .select('id, name, email, phone, current_title, skills, experience_years, location, status, linkedin_url')
    .eq('org_id', orgId)

  if (opts.candidateId) {
    q = q.eq('id', opts.candidateId)
  } else if (opts.nameQuery) {
    q = q.ilike('name', `%${opts.nameQuery}%`)
  } else {
    // Caller guards against this; return empty so the tool emits its own error.
    return { data: [], error: null }
  }

  const { data, error } = await q.limit(3)
  return { data: data as AgentCandidateLookupRow[] | null, error }
}

export interface AgentCandidatePoolRow {
  id: string
  name: string
  email: string
  current_title: string | null
  experience_years: number | null
  location: string | null
  skills: string[] | null
  status: CandidateStatus
}

export async function searchCandidatePoolForAgent(
  supabase: Supabase,
  orgId: string,
  opts: { location?: string; minExperience?: number | null; maxExperience?: number | null; fetchLimit: number },
): Promise<{ data: AgentCandidatePoolRow[] | null; error: PostgrestError | null }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q: any = supabase
    .from('candidates')
    .select('id, name, email, current_title, experience_years, location, skills, status')
    .eq('org_id', orgId)
    .neq('status', 'rejected')

  if (opts.location) q = q.ilike('location', `%${opts.location}%`)
  if (opts.minExperience != null) q = q.gte('experience_years', opts.minExperience)
  if (opts.maxExperience != null) q = q.lte('experience_years', opts.maxExperience)

  const { data, error } = await q.order('created_at', { ascending: false }).limit(opts.fetchLimit)
  return { data: data as AgentCandidatePoolRow[] | null, error }
}

export async function getCandidateNameAndStatus(
  supabase: Supabase,
  orgId: string,
  candidateId: string,
): Promise<{ name: string; status: CandidateStatus } | null> {
  const { data, error } = await supabase
    .from('candidates')
    .select('name, status')
    .eq('id', candidateId)
    .eq('org_id', orgId)
    .single()

  if (error || !data) return null
  return data as { name: string; status: CandidateStatus }
}

// NOTE: copilot-tools.ts line 2102 (updateCandidateStatus) is covered by
// setCandidateStatus above — it returns { error } which the tool inspects for
// the 'Error updating status: <msg>' message. No separate function needed.

export async function markCandidateOfferExtended(
  supabase: Supabase,
  orgId: string,
  candidateId: string,
): Promise<void> {
  await supabase
    .from('candidates')
    .update({ status: 'offer_extended', updated_at: new Date().toISOString() } as never)
    .eq('id', candidateId)
    .eq('org_id', orgId)
}

export async function markCandidateHired(
  supabase: Supabase,
  orgId: string,
  candidateId: string,
): Promise<void> {
  await supabase
    .from('candidates')
    .update({ status: 'hired', updated_at: new Date().toISOString() } as never)
    .eq('id', candidateId)
    .eq('org_id', orgId)
}
