import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  Database,
  EmployeeProfile,
  EmployeeStatus,
  EmploymentEvent,
} from '@/lib/types/database'

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

// ── Org chart primitive: who reports to whom ─────────────────────────────────
// Setting manager_id fires the manager-change trigger, which writes a
// 'manager_changed' event onto the timeline automatically.
export async function setEmployeeManager(
  supabase: Supabase,
  orgId: string,
  employeeId: string,
  managerId: string | null,
): Promise<EmployeeProfile> {
  if (managerId === employeeId) {
    throw new Error('An employee cannot be their own manager.')
  }

  const { data, error } = await supabase
    .from('employee_profiles')
    .update({ manager_id: managerId } as never)
    .eq('id', employeeId)
    .eq('org_id', orgId)
    .select('*')
    .single()

  if (error) throw error
  return data as EmployeeProfile
}

// ── Employment audit log (the timeline) ──────────────────────────────────────
export async function listEmployeeEvents(
  supabase: Supabase,
  orgId: string,
  employeeId: string,
  limit = 100,
): Promise<EmploymentEvent[]> {
  const { data, error } = await supabase
    .from('employee_events')
    .select('*')
    .eq('org_id', orgId)
    .eq('employee_id', employeeId)
    .order('occurred_at', { ascending: false })
    .limit(limit)

  if (error) throw error
  return (data ?? []) as EmploymentEvent[]
}

// Append a manual note to an employee's timeline. The trigger-driven events
// (hired/joined/manager_changed/terminated) are written by the data layer;
// this is for human/agent observations that aren't a structural transition.
export async function recordEmployeeNote(
  supabase: Supabase,
  orgId: string,
  employeeId: string,
  note: string,
  recordedBy: string,
): Promise<EmploymentEvent> {
  const { data, error } = await supabase
    .from('employee_events')
    .insert({
      org_id: orgId,
      employee_id: employeeId,
      event_type: 'note',
      details: { note },
      recorded_by: recordedBy,
    } as never)
    .select('*')
    .single()

  if (error) throw error
  return data as EmploymentEvent
}
