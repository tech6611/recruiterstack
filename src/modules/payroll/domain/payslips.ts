import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  Database,
  Payslip,
  PayslipBreakdown,
  PayslipInsert,
} from '@/lib/types/database'

type Supabase = SupabaseClient<Database>

// Payslips are owned by their parent run — there is no createPayslip without a
// runId. Each (run, employee) pair is unique, so we use upsert semantics from
// the admin UI/agent (re-saving a row updates it; deletions are explicit).

// ── Joined shape for admin tables ───────────────────────────────────────────

export interface PayslipWithEmployee extends Payslip {
  /** Resolved at read time from employee_profiles → people; falls back to the
   *  snapshot stored on the payslip if the employee record has since changed. */
  employee_name:  string | null
  employee_email: string | null
}

// ── Run-scoped reads (admin) ─────────────────────────────────────────────────

export async function listPayslipsForRun(
  supabase: Supabase,
  orgId:    string,
  runId:    string,
): Promise<PayslipWithEmployee[]> {
  const { data, error } = await supabase
    .from('payslips')
    .select(`
      *,
      employee:employee_profiles (
        id,
        person:people(name, email)
      )
    `)
    .eq('org_id', orgId)
    .eq('run_id', runId)
    .order('created_at', { ascending: true })
  if (error) throw error

  type Row = Payslip & {
    employee: { person: { name: string | null; email: string | null } | null } | null
  }
  return ((data ?? []) as unknown as Row[]).map(r => ({
    ...r,
    employee_name:  r.employee?.person?.name  ?? r.employee_name_snapshot,
    employee_email: r.employee?.person?.email ?? r.employee_email_snapshot,
  }))
}

export async function getPayslip(
  supabase: Supabase,
  orgId:    string,
  payslipId: string,
): Promise<PayslipWithEmployee | null> {
  const { data, error } = await supabase
    .from('payslips')
    .select(`
      *,
      employee:employee_profiles (
        id,
        person:people(name, email)
      )
    `)
    .eq('org_id', orgId)
    .eq('id', payslipId)
    .maybeSingle()
  if (error) throw error
  if (!data) return null

  type Row = Payslip & {
    employee: { person: { name: string | null; email: string | null } | null } | null
  }
  const row = data as unknown as Row
  return {
    ...row,
    employee_name:  row.employee?.person?.name  ?? row.employee_name_snapshot,
    employee_email: row.employee?.person?.email ?? row.employee_email_snapshot,
  }
}

// ── Employee-scoped reads ────────────────────────────────────────────────────

export interface PayslipForEmployee extends Payslip {
  run: {
    period_start: string
    period_end:   string
    pay_date:     string | null
    currency:     string
    status:       string
  }
}

/** Admin lookup: all payslips for one employee, across runs (newest first). */
export async function listEmployeePayslips(
  supabase: Supabase,
  orgId:    string,
  employeeId: string,
  limit:    number = 100,
): Promise<PayslipForEmployee[]> {
  const { data, error } = await supabase
    .from('payslips')
    .select(`
      *,
      run:payroll_runs (
        period_start, period_end, pay_date, currency, status
      )
    `)
    .eq('org_id', orgId)
    .eq('employee_id', employeeId)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error

  type Row = Payslip & { run: PayslipForEmployee['run'] | null }
  return ((data ?? []) as unknown as Row[])
    // Drop rows whose parent run somehow vanished (defensive — FK is ON DELETE CASCADE).
    .filter(r => r.run !== null)
    .map(r => ({ ...r, run: r.run! }))
}

/** Self-service: the calling user's own payslip history. Returns [] when the
 *  user has no employee_profile (i.e. an admin who was never hired through
 *  the ATS flow). */
export async function listMyPayslips(
  supabase: Supabase,
  orgId:    string,
  userId:   string,
): Promise<PayslipForEmployee[]> {
  const { data: profile, error: profileErr } = await supabase
    .from('employee_profiles')
    .select('id')
    .eq('org_id', orgId)
    .eq('user_id', userId)
    .in('status', ['pending', 'active', 'terminated'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (profileErr) throw profileErr
  if (!profile) return []

  return listEmployeePayslips(supabase, orgId, (profile as { id: string }).id)
}

/** Self-service: one of my own payslips. Returns null for any payslip the user
 *  doesn't own — never leaks across employees. */
export async function getMyPayslip(
  supabase: Supabase,
  orgId:    string,
  userId:   string,
  payslipId: string,
): Promise<PayslipForEmployee | null> {
  const { data: profile, error: profileErr } = await supabase
    .from('employee_profiles')
    .select('id')
    .eq('org_id', orgId)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (profileErr) throw profileErr
  if (!profile) return null

  const employeeId = (profile as { id: string }).id

  const { data, error } = await supabase
    .from('payslips')
    .select(`
      *,
      run:payroll_runs (
        period_start, period_end, pay_date, currency, status
      )
    `)
    .eq('org_id', orgId)
    .eq('id', payslipId)
    .eq('employee_id', employeeId)
    .maybeSingle()
  if (error) throw error
  if (!data) return null

  type Row = Payslip & { run: PayslipForEmployee['run'] | null }
  const row = data as unknown as Row
  if (!row.run) return null
  return { ...row, run: row.run }
}

// ── Writes ───────────────────────────────────────────────────────────────────

export interface UpsertPayslipInput {
  employee_id:      string
  gross:            number
  deductions_total: number
  net:              number
  breakdown?:       PayslipBreakdown
  notes?:           string | null
}

/** Insert or update one payslip for a (run, employee). Snapshots the employee's
 *  current name/email so the ledger is robust to later record edits. Refuses
 *  to write if the run is finalized. */
export async function upsertPayslip(
  supabase: Supabase,
  orgId:    string,
  runId:    string,
  input:    UpsertPayslipInput,
): Promise<Payslip> {
  // Guard: finalized runs are frozen.
  const { data: runRow, error: runErr } = await supabase
    .from('payroll_runs')
    .select('id, status')
    .eq('org_id', orgId).eq('id', runId)
    .maybeSingle()
  if (runErr)   throw runErr
  if (!runRow)  throw new Error('Payroll run not found')
  if ((runRow as { status: string }).status === 'finalized') {
    throw new Error('Run is finalized; payslips cannot be edited')
  }

  // Math consistency: net = gross - deductions_total (caller computes; we just
  // sanity-check so a bad UI doesn't write contradictions).
  const expectedNet = Number((input.gross - input.deductions_total).toFixed(2))
  const givenNet    = Number(input.net.toFixed(2))
  if (Math.abs(expectedNet - givenNet) > 0.01) {
    throw new Error(`net (${givenNet}) does not match gross - deductions (${expectedNet})`)
  }

  // Snapshot employee name/email at write time (ledger pattern).
  const { data: empRow } = await supabase
    .from('employee_profiles')
    .select('person:people(name, email)')
    .eq('org_id', orgId).eq('id', input.employee_id)
    .maybeSingle()
  const person = (empRow as { person: { name: string | null; email: string | null } | null } | null)?.person ?? null

  const row: PayslipInsert = {
    org_id:                  orgId,
    run_id:                  runId,
    employee_id:             input.employee_id,
    employee_name_snapshot:  person?.name  ?? null,
    employee_email_snapshot: person?.email ?? null,
    gross:                   input.gross,
    deductions_total:        input.deductions_total,
    net:                     input.net,
    breakdown:               input.breakdown ?? {},
    notes:                   input.notes     ?? null,
  }

  const { data, error } = await supabase
    .from('payslips')
    .upsert(row as never, { onConflict: 'run_id,employee_id' })
    .select('*').single()
  if (error) throw error
  return data as Payslip
}

export async function deletePayslip(
  supabase:  Supabase,
  orgId:     string,
  payslipId: string,
): Promise<void> {
  // Refuse if the parent run is finalized.
  const { data: row, error: rowErr } = await supabase
    .from('payslips')
    .select('run_id, run:payroll_runs ( status )')
    .eq('org_id', orgId).eq('id', payslipId)
    .maybeSingle()
  if (rowErr) throw rowErr
  if (!row)   return
  const status = (row as unknown as { run: { status: string } | null }).run?.status
  if (status === 'finalized') throw new Error('Run is finalized; payslips cannot be deleted')

  const { error } = await supabase
    .from('payslips')
    .delete()
    .eq('id', payslipId).eq('org_id', orgId)
  if (error) throw error
}
