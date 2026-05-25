import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, EmployeeProfile, EmployeeStatus } from '@/lib/types/database'

type Supabase = SupabaseClient<Database>

// Employee profiles are *created* by DB triggers when a candidacy is
// dispositioned hired (see migration 047) — there is intentionally no
// createEmployee() here, so the "a hire always yields an employee" invariant
// lives in one place and can't be bypassed by a TA surface. This module owns
// reads and the forward lifecycle transitions (pending → active → terminated).

export async function getEmployeeByPerson(
  supabase: Supabase,
  orgId: string,
  personId: string,
): Promise<EmployeeProfile | null> {
  const { data, error } = await supabase
    .from('employee_profiles')
    .select('*')
    .eq('org_id', orgId)
    .eq('person_id', personId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw error
  return (data as EmployeeProfile) ?? null
}

export async function listEmployees(
  supabase: Supabase,
  orgId: string,
  statusFilter?: EmployeeStatus,
): Promise<EmployeeProfile[]> {
  let q = supabase
    .from('employee_profiles')
    .select('*')
    .eq('org_id', orgId)

  if (statusFilter) q = q.eq('status', statusFilter)

  const { data, error } = await q.order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as EmployeeProfile[]
}

export interface EmployeeWithPerson extends EmployeeProfile {
  person: { name: string; email: string } | null
}

// Same list, enriched with the canonical person's name/email for display.
export async function listEmployeesWithPerson(
  supabase: Supabase,
  orgId: string,
  statusFilter?: EmployeeStatus,
): Promise<EmployeeWithPerson[]> {
  let q = supabase
    .from('employee_profiles')
    .select('*, person:people(name, email)')
    .eq('org_id', orgId)

  if (statusFilter) q = q.eq('status', statusFilter)

  const { data, error } = await q.order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as unknown as EmployeeWithPerson[]
}

// Pre-hire joins the org: flip PENDING → ACTIVE and stamp their first day.
// This is the moment a hired candidate literally becomes an employee.
export async function markEmployeeJoined(
  supabase: Supabase,
  orgId: string,
  employeeId: string,
  startDate?: string | null,
): Promise<EmployeeProfile> {
  const now = new Date().toISOString()
  const { data, error } = await supabase
    .from('employee_profiles')
    .update({
      status: 'active',
      joined_at: now,
      start_date: startDate ?? now.slice(0, 10),
    } as never)
    .eq('id', employeeId)
    .eq('org_id', orgId)
    .select('*')
    .single()

  if (error) throw error
  return data as EmployeeProfile
}

export async function markEmployeeTerminated(
  supabase: Supabase,
  orgId: string,
  employeeId: string,
): Promise<EmployeeProfile> {
  const { data, error } = await supabase
    .from('employee_profiles')
    .update({
      status: 'terminated',
      terminated_at: new Date().toISOString(),
    } as never)
    .eq('id', employeeId)
    .eq('org_id', orgId)
    .select('*')
    .single()

  if (error) throw error
  return data as EmployeeProfile
}
