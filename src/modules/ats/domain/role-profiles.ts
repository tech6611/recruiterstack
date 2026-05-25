import type { SupabaseClient } from '@supabase/supabase-js'
import type { Candidate, Database, Role, RoleInsert, RoleUpdate } from '@/lib/types/database'

type Supabase = SupabaseClient<Database>

export async function listRoleProfiles(
  supabase: Supabase,
  orgId: string,
  opts: { status?: string | null; limit: number; offset: number; searchFilter?: string | null },
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query: any = supabase
    .from('roles')
    .select('*', { count: 'exact' })
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })
    .range(opts.offset, opts.offset + opts.limit - 1)

  if (opts.status) query = query.eq('status', opts.status)
  if (opts.searchFilter) query = query.or(opts.searchFilter)

  const { data, error, count } = await query
  if (error) throw error
  return { data: data ?? [], count: count ?? 0 }
}

export async function createRoleProfile(
  supabase: Supabase,
  orgId: string,
  input: RoleInsert,
): Promise<Role> {
  const { data, error } = await supabase
    .from('roles')
    .insert({ ...input, org_id: orgId } as never)
    .select()
    .single()

  if (error) throw error
  return data as Role
}

export async function getRoleProfile(
  supabase: Supabase,
  orgId: string,
  roleId: string,
): Promise<Role | null> {
  const { data, error } = await supabase
    .from('roles')
    .select('*')
    .eq('id', roleId)
    .eq('org_id', orgId)
    .maybeSingle()

  if (error) throw error
  return data as Role | null
}

export async function updateRoleProfile(
  supabase: Supabase,
  orgId: string,
  roleId: string,
  input: RoleUpdate,
): Promise<Role | null> {
  const { data, error } = await supabase
    .from('roles')
    .update(input as never)
    .eq('id', roleId)
    .eq('org_id', orgId)
    .select()
    .maybeSingle()

  if (error) throw error
  return data as Role | null
}

export async function deleteRoleProfile(
  supabase: Supabase,
  orgId: string,
  roleId: string,
): Promise<void> {
  const { error } = await supabase
    .from('roles')
    .delete()
    .eq('id', roleId)
    .eq('org_id', orgId)

  if (error) throw error
}

export async function getCandidateRoleMatchContext(
  supabase: Supabase,
  orgId: string,
  candidateId: string,
  roleId: string,
): Promise<{
  candidate: Candidate
  role: Role
  match: { score: number; strengths: string[]; reasoning: string } | null
} | null> {
  const [candRes, roleRes, matchRes] = await Promise.all([
    supabase
      .from('candidates')
      .select('*')
      .eq('id', candidateId)
      .eq('org_id', orgId)
      .maybeSingle(),
    supabase
      .from('roles')
      .select('*')
      .eq('id', roleId)
      .eq('org_id', orgId)
      .maybeSingle(),
    supabase
      .from('matches')
      .select('score, strengths, reasoning')
      .eq('candidate_id', candidateId)
      .eq('role_id', roleId)
      .maybeSingle(),
  ])

  if (candRes.error) throw candRes.error
  if (roleRes.error) throw roleRes.error
  if (matchRes.error) throw matchRes.error
  if (!candRes.data || !roleRes.data) return null

  return {
    candidate: candRes.data as Candidate,
    role: roleRes.data as Role,
    match: matchRes.data as { score: number; strengths: string[]; reasoning: string } | null,
  }
}

export async function getRoleMatchingInputs(
  supabase: Supabase,
  orgId: string,
  roleId: string,
): Promise<{ role: Role; candidates: Candidate[] } | null> {
  const [roleRes, candsRes] = await Promise.all([
    supabase
      .from('roles')
      .select('*')
      .eq('id', roleId)
      .eq('org_id', orgId)
      .maybeSingle(),
    supabase
      .from('candidates')
      .select('*')
      .eq('org_id', orgId),
  ])

  if (roleRes.error) throw roleRes.error
  if (candsRes.error) throw candsRes.error
  if (!roleRes.data) return null

  return {
    role: roleRes.data as Role,
    candidates: (candsRes.data ?? []) as Candidate[],
  }
}

export async function updateCandidateStatusesForRoleDecision(
  supabase: Supabase,
  orgId: string,
  input: { interviewingIds: string[]; rejectedIds: string[] },
): Promise<void> {
  await Promise.all([
    ...input.interviewingIds.map((id) =>
      supabase
        .from('candidates')
        .update({ status: 'interviewing' } as never)
        .eq('id', id)
        .eq('org_id', orgId),
    ),
    ...input.rejectedIds.map((id) =>
      supabase
        .from('candidates')
        .update({ status: 'rejected' } as never)
        .eq('id', id)
        .eq('org_id', orgId),
    ),
  ])
}
