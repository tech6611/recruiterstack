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

// Self-service "who am I as an employee?" — resolves the calling user's
// employee_profile via the bridge column added in migration 050. Returns null
// when the user is in the org but has no employee record yet (e.g. admins,
// recruiters who haven't been hired through the ATS flow).
export async function getMyEmployeeProfile(
  supabase: Supabase,
  orgId: string,
  userId: string,
): Promise<EmployeeProfile | null> {
  const { data, error } = await supabase
    .from('employee_profiles')
    .select('*')
    .eq('org_id', orgId)
    .eq('user_id', userId)
    .in('status', ['pending', 'active'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw error
  return (data as EmployeeProfile) ?? null
}

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

export interface EmployeeManagerSummary {
  id: string
  name: string | null
  email: string | null
}

export interface EmployeeDetail extends EmployeeWithPerson {
  manager: EmployeeManagerSummary | null
}

// Single-employee read enriched with the person's name/email AND a flat
// summary of their manager (if any). Two queries so we don't depend on a
// generated FK relationship name for the self-join in Supabase's embed syntax.
export async function getEmployeeDetail(
  supabase: Supabase,
  orgId: string,
  employeeId: string,
): Promise<EmployeeDetail | null> {
  const { data: emp, error } = await supabase
    .from('employee_profiles')
    .select('*, person:people(name, email)')
    .eq('id', employeeId)
    .eq('org_id', orgId)
    .maybeSingle()

  if (error) throw error
  if (!emp) return null

  const row = emp as unknown as EmployeeWithPerson
  let manager: EmployeeManagerSummary | null = null

  if (row.manager_id) {
    const { data: mgr, error: mgrErr } = await supabase
      .from('employee_profiles')
      .select('id, person:people(name, email)')
      .eq('id', row.manager_id)
      .eq('org_id', orgId)
      .maybeSingle()

    if (mgrErr) throw mgrErr
    if (mgr) {
      const m = mgr as unknown as { id: string; person: { name: string; email: string } | null }
      manager = { id: m.id, name: m.person?.name ?? null, email: m.person?.email ?? null }
    }
  }

  return { ...row, manager }
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

// ── Org chart reads ──────────────────────────────────────────────────────────
// Two queries we expose: one for "who reports to this person?" (detail page +
// agent), and one for the full chart (flat list with manager_id so the page
// builds the tree client-side; fine at current scale).

export async function listDirectReports(
  supabase: Supabase,
  orgId: string,
  managerEmployeeId: string,
): Promise<EmployeeWithPerson[]> {
  const { data, error } = await supabase
    .from('employee_profiles')
    .select('*, person:people(name, email)')
    .eq('org_id', orgId)
    .eq('manager_id', managerEmployeeId)
    .order('created_at', { ascending: true })

  if (error) throw error
  return (data ?? []) as unknown as EmployeeWithPerson[]
}

export interface OrgChartNode {
  id: string
  status: EmployeeStatus
  manager_id: string | null
  person: { name: string; email: string } | null
}

// Live people in the org chart (pending + active). Terminated are excluded so
// the tree reflects the current reporting structure.
export async function listOrgChart(
  supabase: Supabase,
  orgId: string,
): Promise<OrgChartNode[]> {
  const { data, error } = await supabase
    .from('employee_profiles')
    .select('id, status, manager_id, person:people(name, email)')
    .eq('org_id', orgId)
    .in('status', ['pending', 'active'])
    .order('created_at', { ascending: true })

  if (error) throw error
  return (data ?? []) as unknown as OrgChartNode[]
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
