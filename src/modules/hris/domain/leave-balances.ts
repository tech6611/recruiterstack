import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  Database,
  Holiday,
  HolidayInsert,
  LeavePolicy,
  LeavePolicyUpdate,
  TimeOffRequest,
  TimeOffRequestType,
} from '@/lib/types/database'

type Supabase = SupabaseClient<Database>

const LEAVE_TYPES: TimeOffRequestType[] = ['vacation', 'sick', 'personal', 'unpaid']

// ── Policies ─────────────────────────────────────────────────────────────────

export async function listPolicies(
  supabase: Supabase,
  orgId: string,
): Promise<LeavePolicy[]> {
  const { data, error } = await supabase
    .from('leave_policies')
    .select('*')
    .eq('org_id', orgId)
    .order('leave_type', { ascending: true })
  if (error) throw error
  return (data ?? []) as LeavePolicy[]
}

export async function updatePolicy(
  supabase: Supabase,
  orgId: string,
  policyId: string,
  patch: LeavePolicyUpdate,
): Promise<LeavePolicy> {
  const { data, error } = await supabase
    .from('leave_policies')
    .update(patch as never)
    .eq('id', policyId).eq('org_id', orgId)
    .select('*').single()
  if (error) throw error
  return data as LeavePolicy
}

// ── Computed balance ─────────────────────────────────────────────────────────

export interface LeaveTypeBalance {
  leave_type: TimeOffRequestType
  granted:    number    // policy.annual_days
  used:       number    // sum of approved request days, current year
  pending:    number    // sum of pending request days, current year
  available:  number    // granted - used - pending (clamped at 0)
}

export interface LeaveBalance {
  year:    number
  by_type: Record<TimeOffRequestType, LeaveTypeBalance>
}

function daysInclusive(start: string, end: string): number {
  // Calendar-day inclusive count. start/end are YYYY-MM-DD.
  const s = new Date(start + 'T00:00:00Z')
  const e = new Date(end   + 'T00:00:00Z')
  const diff = Math.round((e.getTime() - s.getTime()) / 86_400_000)
  return Math.max(0, diff + 1)
}

export async function getLeaveBalance(
  supabase: Supabase,
  orgId: string,
  employeeId: string,
  year: number = new Date().getUTCFullYear(),
): Promise<LeaveBalance> {
  const yearStart = `${year}-01-01`
  const yearEnd   = `${year}-12-31`

  const [policiesRes, requestsRes] = await Promise.all([
    supabase
      .from('leave_policies')
      .select('leave_type, annual_days, is_active')
      .eq('org_id', orgId)
      .eq('is_active', true),
    supabase
      .from('time_off_requests')
      .select('request_type, start_date, end_date, status')
      .eq('org_id', orgId)
      .eq('employee_id', employeeId)
      .in('status', ['approved', 'pending'])
      .gte('start_date', yearStart)
      .lte('start_date', yearEnd),
  ])
  if (policiesRes.error)  throw policiesRes.error
  if (requestsRes.error)  throw requestsRes.error

  const granted: Record<TimeOffRequestType, number> = { vacation: 0, sick: 0, personal: 0, unpaid: 0 }
  for (const p of (policiesRes.data ?? []) as Array<{ leave_type: TimeOffRequestType; annual_days: number }>) {
    granted[p.leave_type] = p.annual_days
  }

  const used:    Record<TimeOffRequestType, number> = { vacation: 0, sick: 0, personal: 0, unpaid: 0 }
  const pending: Record<TimeOffRequestType, number> = { vacation: 0, sick: 0, personal: 0, unpaid: 0 }
  for (const r of (requestsRes.data ?? []) as Array<Pick<TimeOffRequest, 'request_type' | 'start_date' | 'end_date' | 'status'>>) {
    const d = daysInclusive(r.start_date, r.end_date)
    if (r.status === 'approved') used[r.request_type]    += d
    if (r.status === 'pending')  pending[r.request_type] += d
  }

  const by_type = {} as Record<TimeOffRequestType, LeaveTypeBalance>
  for (const t of LEAVE_TYPES) {
    const g = granted[t]
    const u = used[t]
    const p = pending[t]
    by_type[t] = {
      leave_type: t,
      granted:    g,
      used:       u,
      pending:    p,
      available:  Math.max(0, g - u - p),
    }
  }
  return { year, by_type }
}

// ── Holidays ─────────────────────────────────────────────────────────────────

export interface ListHolidaysFilter {
  /** ISO date (YYYY-MM-DD); only return holidays on or after this date. */
  from?: string
  limit?: number
}

export async function listHolidays(
  supabase: Supabase,
  orgId: string,
  filter: ListHolidaysFilter = {},
): Promise<Holiday[]> {
  let q = supabase.from('holidays').select('*').eq('org_id', orgId)
  if (filter.from) q = q.gte('date', filter.from)
  const { data, error } = await q
    .order('date', { ascending: true })
    .limit(filter.limit ?? 200)
  if (error) throw error
  return (data ?? []) as Holiday[]
}

export async function createHoliday(
  supabase: Supabase,
  orgId: string,
  input: { date: string; name: string; country?: string | null },
): Promise<Holiday> {
  const row: HolidayInsert = {
    org_id:  orgId,
    date:    input.date,
    name:    input.name.trim(),
    country: input.country ?? null,
  }
  const { data, error } = await supabase
    .from('holidays').insert(row as never).select('*').single()
  if (error) throw error
  return data as Holiday
}

export async function deleteHoliday(
  supabase: Supabase,
  orgId: string,
  holidayId: string,
): Promise<void> {
  const { error } = await supabase
    .from('holidays')
    .delete()
    .eq('id', holidayId).eq('org_id', orgId)
  if (error) throw error
}
