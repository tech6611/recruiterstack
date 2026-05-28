import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  Database,
  TimeOffRequest,
  TimeOffRequestInsert,
  TimeOffRequestType,
  TimeOffStatus,
} from '@/lib/types/database'
import { createNotification } from '@/lib/api/notify'

type Supabase = SupabaseClient<Database>

// Time-off requests have their own lightweight pending→approved/rejected/cancelled
// lifecycle. The approver is auto-resolved at create time via the manager bridge
// from migration 050 (employee.user_id → manager_id → manager.user_id). If the
// requester has no manager set, the request is created without an approver and
// an admin can manually decide.

export interface CreateTimeOffInput {
  employeeId:   string
  requestType:  TimeOffRequestType
  startDate:    string                     // YYYY-MM-DD
  endDate:      string                     // YYYY-MM-DD
  hoursTotal?:  number | null
  reason?:      string | null
  requestedBy?: string | null              // user_id of the submitter (defaults to employee.user_id if known)
}

export async function createTimeOffRequest(
  supabase: Supabase,
  orgId: string,
  input: CreateTimeOffInput,
): Promise<TimeOffRequest> {
  if (new Date(input.endDate) < new Date(input.startDate)) {
    throw new Error('end_date must be on or after start_date.')
  }

  // Resolve approver = requester's manager via the bridge. Two-step query so a
  // missing link returns null gracefully rather than throwing.
  const { data: emp } = await supabase
    .from('employee_profiles')
    .select('user_id, manager_id')
    .eq('org_id', orgId)
    .eq('id', input.employeeId)
    .maybeSingle()

  const empRow = emp as { user_id: string | null; manager_id: string | null } | null
  let approverUserId: string | null = null
  if (empRow?.manager_id) {
    const { data: mgr } = await supabase
      .from('employee_profiles')
      .select('user_id')
      .eq('org_id', orgId)
      .eq('id', empRow.manager_id)
      .maybeSingle()
    approverUserId = (mgr as { user_id: string | null } | null)?.user_id ?? null
  }

  const row: TimeOffRequestInsert = {
    org_id:           orgId,
    employee_id:      input.employeeId,
    request_type:     input.requestType,
    start_date:       input.startDate,
    end_date:         input.endDate,
    hours_total:      input.hoursTotal ?? null,
    reason:           input.reason ?? null,
    approver_user_id: approverUserId,
    requested_by:     input.requestedBy ?? empRow?.user_id ?? null,
  }

  const { data, error } = await supabase
    .from('time_off_requests')
    .insert(row as never)
    .select('*')
    .single()

  if (error) throw error
  const created = data as TimeOffRequest

  // Notify the assigned approver (manager). Fire-and-forget — notification
  // failure must never block the request itself.
  if (created.approver_user_id) {
    const range = created.start_date === created.end_date
      ? created.start_date
      : `${created.start_date} → ${created.end_date}`
    void createNotification({
      orgId:        orgId,
      userId:       created.approver_user_id,
      type:         'time_off_requested',
      title:        `New ${created.request_type} request`,
      body:         range,
      resourceType: 'time_off_request',
      resourceId:   created.id,
    })
  }

  return created
}

export interface ListTimeOffFilter {
  employeeId?: string
  status?:     TimeOffStatus
  limit?:      number
}

export async function listTimeOffRequests(
  supabase: Supabase,
  orgId: string,
  filter: ListTimeOffFilter = {},
): Promise<TimeOffRequest[]> {
  let q = supabase
    .from('time_off_requests')
    .select('*')
    .eq('org_id', orgId)

  if (filter.employeeId) q = q.eq('employee_id', filter.employeeId)
  if (filter.status)     q = q.eq('status',      filter.status)

  const { data, error } = await q
    .order('requested_at', { ascending: false })
    .limit(filter.limit ?? 100)

  if (error) throw error
  return (data ?? []) as TimeOffRequest[]
}

interface DecideOpts {
  decidedBy?: string | null
  note?:      string | null
}

async function transitionTimeOff(
  supabase: Supabase,
  orgId: string,
  requestId: string,
  status: Exclude<TimeOffStatus, 'pending'>,
  opts: DecideOpts = {},
): Promise<TimeOffRequest> {
  const { data, error } = await supabase
    .from('time_off_requests')
    .update({
      status,
      decided_at:   new Date().toISOString(),
      decided_by:   opts.decidedBy ?? null,
      decided_note: opts.note ?? null,
    } as never)
    .eq('id', requestId)
    .eq('org_id', orgId)
    .eq('status', 'pending')                  // only transition pending → terminal; idempotent
    .select('*')
    .maybeSingle()

  if (error) throw error
  if (!data) {
    throw new Error('Request not found or not in pending status (already decided?).')
  }
  const updated = data as TimeOffRequest

  // Notify the requester that their request was decided. fire-and-forget.
  if (updated.requested_by) {
    const range = updated.start_date === updated.end_date
      ? updated.start_date
      : `${updated.start_date} → ${updated.end_date}`
    void createNotification({
      orgId,
      userId:       updated.requested_by,
      type:         'time_off_decided',
      title:        `Your ${updated.request_type} request was ${status}`,
      body:         range,
      resourceType: 'time_off_request',
      resourceId:   updated.id,
    })
  }

  return updated
}

export async function approveTimeOffRequest(
  supabase: Supabase, orgId: string, requestId: string, opts: DecideOpts = {},
): Promise<TimeOffRequest> {
  return transitionTimeOff(supabase, orgId, requestId, 'approved', opts)
}

export async function rejectTimeOffRequest(
  supabase: Supabase, orgId: string, requestId: string, opts: DecideOpts = {},
): Promise<TimeOffRequest> {
  return transitionTimeOff(supabase, orgId, requestId, 'rejected', opts)
}

export async function cancelTimeOffRequest(
  supabase: Supabase, orgId: string, requestId: string, opts: DecideOpts = {},
): Promise<TimeOffRequest> {
  return transitionTimeOff(supabase, orgId, requestId, 'cancelled', opts)
}

// Lightweight formatter for agent + UI output ("3 days vacation, May 30 – Jun 1").
export function formatTimeOffRange(req: TimeOffRequest): string {
  if (req.start_date === req.end_date) return req.start_date
  return `${req.start_date} → ${req.end_date}`
}
