import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'
import type { Opening } from '@/lib/types/requisitions'

type Supabase = SupabaseClient<Database>

export async function getOpeningById(
  supabase: Supabase,
  orgId: string,
  openingId: string,
): Promise<Opening | null> {
  const { data, error } = await supabase
    .from('openings')
    .select('*')
    .eq('org_id', orgId)
    .eq('id', openingId)
    .maybeSingle()

  if (error) throw error
  return data as Opening | null
}

/** Approved requisitions for an org — the only openings a job may be created
 *  from. Used by the copilot job tool to offer a pick-list (or tell the user
 *  none exist) instead of minting a req-less job. */
export async function listApprovedOpenings(
  supabase: Supabase,
  orgId: string,
): Promise<Array<{ id: string; title: string }>> {
  const { data, error } = await supabase
    .from('openings')
    .select('id, title')
    .eq('org_id', orgId)
    .eq('status', 'approved')
    .order('created_at', { ascending: false })

  if (error) throw error
  return (data ?? []) as Array<{ id: string; title: string }>
}

/** Requisitions for an org, newest first, with the fields the copilot lists.
 *  Optional status filter (draft | pending_approval | approved | open | ...). */
export async function listOpenings(
  supabase: Supabase,
  orgId: string,
  statusFilter?: string | null,
): Promise<Array<{ id: string; title: string; status: string; department_id: string | null; created_at: string }>> {
  let q = supabase
    .from('openings')
    .select('id, title, status, department_id, created_at')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })

  if (statusFilter) q = q.eq('status', statusFilter as never)

  const { data, error } = await q
  if (error) throw error
  return (data ?? []) as Array<{ id: string; title: string; status: string; department_id: string | null; created_at: string }>
}

export interface CreateOpeningInput {
  title: string
  departmentId?: string | null
  locationId?: string | null
  hiringManagerId?: string | null
  employmentType?: 'full_time' | 'part_time' | 'contract' | 'intern' | 'temp'
  compMin?: number | null
  compMax?: number | null
  compCurrency?: string
  targetStartDate?: string | null       // YYYY-MM-DD
  justification?: string | null
}

/** Create a draft requisition (opening). Mirrors the insert in
 *  POST /api/openings — status is always 'draft' on create; moving to
 *  pending_approval happens via the approval engine (see submit). The acting
 *  user is stamped as both created_by and the default recruiter. */
export async function createOpening(
  supabase: Supabase,
  orgId: string,
  input: CreateOpeningInput,
  createdBy: string,
): Promise<Opening> {
  const { data, error } = await supabase
    .from('openings')
    .insert({
      org_id:            orgId,
      title:             input.title,
      department_id:     input.departmentId ?? null,
      location_id:       input.locationId ?? null,
      hiring_manager_id: input.hiringManagerId ?? null,
      employment_type:   input.employmentType ?? 'full_time',
      comp_min:          input.compMin ?? null,
      comp_max:          input.compMax ?? null,
      comp_currency:     input.compCurrency ?? 'USD',
      target_start_date: input.targetStartDate ?? null,
      recruiter_id:      createdBy,
      justification:     input.justification ?? null,
      status:            'draft',
      created_by:        createdBy,
    } as never)
    .select('*')
    .single()

  if (error) throw error
  return data as Opening
}

/** Resolve a department by (case-insensitive) name within an org. Returns null
 *  when there is no match — the copilot tool surfaces the available names. */
export async function findDepartmentByName(
  supabase: Supabase,
  orgId: string,
  name: string,
): Promise<{ id: string; name: string } | null> {
  const { data, error } = await supabase
    .from('departments')
    .select('id, name')
    .eq('org_id', orgId)
    .ilike('name', name.trim())
    .maybeSingle()

  if (error) throw error
  return (data ?? null) as { id: string; name: string } | null
}

/** Resolve an (active) location by case-insensitive name within an org. Returns
 *  null when there is no match — the copilot tool surfaces a clear error. */
export async function findLocationByName(
  supabase: Supabase,
  orgId: string,
  name: string,
): Promise<{ id: string; name: string } | null> {
  const { data, error } = await supabase
    .from('locations')
    .select('id, name')
    .eq('org_id', orgId)
    .eq('is_active', true)
    .ilike('name', name.trim())
    .maybeSingle()

  if (error) throw error
  return (data ?? null) as { id: string; name: string } | null
}

/** Resolve an org member by case-insensitive email. Scoped through the
 *  org_members bridge so only active members of THIS org resolve (the users
 *  table itself is global). Returns null when there is no match. */
export async function findUserByEmail(
  supabase: Supabase,
  orgId: string,
  email: string,
): Promise<{ id: string; full_name: string | null; email: string } | null> {
  const { data, error } = await supabase
    .from('org_members')
    .select('users:users!inner(id, full_name, email)')
    .eq('org_id', orgId)
    .eq('is_active', true)
    .ilike('users.email', email.trim())
    .maybeSingle()

  if (error) throw error
  if (!data) return null
  // The embedded `users` relation comes back as a nested object.
  const u = (data as unknown as { users: { id: string; full_name: string | null; email: string } }).users
  return { id: u.id, full_name: u.full_name, email: u.email }
}
