import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  CompensationRecord,
  CompensationRecordInsert,
  Database,
  PayFrequency,
} from '@/lib/types/database'
import { createNotification } from '@/lib/api/notify'

type Supabase = SupabaseClient<Database>

// Compensation is an immutable sequence of records — every change is a new row
// with an effective_date. The "current" comp = the most recent record. A DB
// trigger lands a comp_changed event on employee_events automatically; this
// module never writes that event itself (single source of truth, can't be
// bypassed — same pattern as employee creation in migration 047).

export async function getCurrentCompensation(
  supabase: Supabase,
  orgId: string,
  employeeId: string,
): Promise<CompensationRecord | null> {
  const { data, error } = await supabase
    .from('compensation_records')
    .select('*')
    .eq('org_id', orgId)
    .eq('employee_id', employeeId)
    .order('effective_date', { ascending: false })
    .order('recorded_at',    { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw error
  return (data as CompensationRecord) ?? null
}

export async function listCompensationHistory(
  supabase: Supabase,
  orgId: string,
  employeeId: string,
): Promise<CompensationRecord[]> {
  const { data, error } = await supabase
    .from('compensation_records')
    .select('*')
    .eq('org_id', orgId)
    .eq('employee_id', employeeId)
    .order('effective_date', { ascending: false })
    .order('recorded_at',    { ascending: false })

  if (error) throw error
  return (data ?? []) as CompensationRecord[]
}

export interface RecordCompensationInput {
  employeeId:        string
  effectiveDate:     string            // YYYY-MM-DD
  baseSalary:        number
  currency?:         string            // defaults to 'USD'
  payFrequency?:     PayFrequency      // defaults to 'annual'
  bonusAmount?:      number | null
  equityNotes?:      string | null
  variablePayNotes?: string | null
  reason?:           string | null
  recordedBy?:       string | null
}

export async function recordCompensation(
  supabase: Supabase,
  orgId: string,
  input: RecordCompensationInput,
): Promise<CompensationRecord> {
  if (!(input.baseSalary > 0)) {
    throw new Error('base_salary must be positive.')
  }

  const row: CompensationRecordInsert = {
    org_id:             orgId,
    employee_id:        input.employeeId,
    effective_date:     input.effectiveDate,
    base_salary:        input.baseSalary,
    currency:           input.currency       ?? 'USD',
    pay_frequency:      input.payFrequency   ?? 'annual',
    bonus_amount:       input.bonusAmount    ?? null,
    equity_notes:       input.equityNotes    ?? null,
    variable_pay_notes: input.variablePayNotes ?? null,
    reason:             input.reason         ?? null,
    recorded_by:        input.recordedBy     ?? null,
  }

  const { data, error } = await supabase
    .from('compensation_records')
    .insert(row as never)
    .select('*')
    .single()

  if (error) throw error
  const created = data as CompensationRecord

  // Notify the affected employee (if they're a Clerk user) that their
  // compensation was updated. fire-and-forget.
  const { data: emp } = await supabase
    .from('employee_profiles')
    .select('user_id')
    .eq('id', created.employee_id)
    .eq('org_id', orgId)
    .maybeSingle()
  const empUserId = (emp as { user_id: string | null } | null)?.user_id ?? null
  if (empUserId) {
    void createNotification({
      orgId,
      userId:       empUserId,
      type:         'comp_changed',
      title:        'Your compensation was updated',
      body:         `${formatComp(created)} effective ${created.effective_date}`,
      resourceType: 'compensation_record',
      resourceId:   created.id,
    })
  }

  return created
}

export function formatComp(c: CompensationRecord | null | undefined): string {
  if (!c) return '—'
  const amount = c.base_salary.toLocaleString(undefined, { maximumFractionDigits: 0 })
  return `${c.currency} ${amount} / ${c.pay_frequency}`
}
