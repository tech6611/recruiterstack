import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  Database,
  PayrollRun,
  PayrollRunInsert,
  PayrollRunStatus,
  PayrollRunUpdate,
} from '@/lib/types/database'

type Supabase = SupabaseClient<Database>

// Run-level totals are computed on read (sum of payslip rows) — same pattern as
// leave balances and OKR progress. No aggregate cache, no triggers, no drift.

export interface PayrollRunTotals {
  payslip_count:          number
  gross_total:            number
  deductions_total:       number
  net_total:              number
}

export interface PayrollRunSummary extends PayrollRun {
  totals: PayrollRunTotals
}

// ── Reads ────────────────────────────────────────────────────────────────────

export interface ListPayrollRunsFilter {
  status?: PayrollRunStatus
  limit?:  number
}

export async function listRuns(
  supabase: Supabase,
  orgId:    string,
  filter:   ListPayrollRunsFilter = {},
): Promise<PayrollRunSummary[]> {
  let q = supabase.from('payroll_runs').select('*').eq('org_id', orgId)
  if (filter.status) q = q.eq('status', filter.status)

  const { data: runs, error } = await q
    .order('period_end', { ascending: false })
    .limit(filter.limit ?? 100)
  if (error) throw error
  const list = (runs ?? []) as PayrollRun[]
  if (list.length === 0) return []

  // One round-trip for per-run totals across all returned runs.
  const runIds = list.map(r => r.id)
  const { data: slipsData, error: slipsErr } = await supabase
    .from('payslips')
    .select('run_id, gross, deductions_total, net')
    .in('run_id', runIds)
  if (slipsErr) throw slipsErr

  const totalsByRun = new Map<string, PayrollRunTotals>()
  for (const id of runIds) {
    totalsByRun.set(id, { payslip_count: 0, gross_total: 0, deductions_total: 0, net_total: 0 })
  }
  for (const s of (slipsData ?? []) as Array<{ run_id: string; gross: number; deductions_total: number; net: number }>) {
    const t = totalsByRun.get(s.run_id)!
    t.payslip_count    += 1
    t.gross_total      += Number(s.gross)
    t.deductions_total += Number(s.deductions_total)
    t.net_total        += Number(s.net)
  }

  return list.map(r => ({ ...r, totals: totalsByRun.get(r.id)! }))
}

export async function getRun(
  supabase: Supabase,
  orgId:    string,
  runId:    string,
): Promise<PayrollRunSummary | null> {
  const { data, error } = await supabase
    .from('payroll_runs')
    .select('*')
    .eq('org_id', orgId).eq('id', runId)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  const run = data as PayrollRun

  const { data: slipsData, error: slipsErr } = await supabase
    .from('payslips')
    .select('gross, deductions_total, net')
    .eq('run_id', runId)
  if (slipsErr) throw slipsErr

  const totals: PayrollRunTotals = { payslip_count: 0, gross_total: 0, deductions_total: 0, net_total: 0 }
  for (const s of (slipsData ?? []) as Array<{ gross: number; deductions_total: number; net: number }>) {
    totals.payslip_count    += 1
    totals.gross_total      += Number(s.gross)
    totals.deductions_total += Number(s.deductions_total)
    totals.net_total        += Number(s.net)
  }
  return { ...run, totals }
}

// ── Writes ───────────────────────────────────────────────────────────────────

export interface CreateRunInput {
  period_start: string                    // YYYY-MM-DD
  period_end:   string                    // YYYY-MM-DD
  pay_date?:    string | null
  currency?:    string                    // defaults to 'INR'
  notes?:       string | null
}

export async function createRun(
  supabase: Supabase,
  orgId:    string,
  input:    CreateRunInput,
): Promise<PayrollRun> {
  if (input.period_end < input.period_start) {
    throw new Error('period_end must be on or after period_start')
  }

  const row: PayrollRunInsert = {
    org_id:       orgId,
    period_start: input.period_start,
    period_end:   input.period_end,
    pay_date:     input.pay_date  ?? null,
    currency:     input.currency  ?? 'INR',
    notes:        input.notes     ?? null,
  }
  const { data, error } = await supabase
    .from('payroll_runs').insert(row as never).select('*').single()
  if (error) throw error
  return data as PayrollRun
}

export async function updateRun(
  supabase: Supabase,
  orgId:    string,
  runId:    string,
  patch:    Pick<PayrollRunUpdate, 'period_start' | 'period_end' | 'pay_date' | 'currency' | 'notes'>,
): Promise<PayrollRun> {
  // Finalized runs are immutable from this update path; the UI hides edit
  // controls when status='finalized', and we enforce it again here.
  const existing = await getRun(supabase, orgId, runId)
  if (!existing) throw new Error('Payroll run not found')
  if (existing.status === 'finalized') throw new Error('Run is finalized; create a new run for corrections')

  if (patch.period_start && patch.period_end && patch.period_end < patch.period_start) {
    throw new Error('period_end must be on or after period_start')
  }

  const { data, error } = await supabase
    .from('payroll_runs')
    .update(patch as never)
    .eq('id', runId).eq('org_id', orgId)
    .select('*').single()
  if (error) throw error
  return data as PayrollRun
}

export async function finalizeRun(
  supabase: Supabase,
  orgId:    string,
  runId:    string,
  userId:   string,
): Promise<PayrollRun> {
  const existing = await getRun(supabase, orgId, runId)
  if (!existing) throw new Error('Payroll run not found')
  if (existing.status === 'finalized') return existing
  if (existing.totals.payslip_count === 0) {
    throw new Error('Cannot finalize an empty run — add at least one payslip first')
  }

  const patch: PayrollRunUpdate = {
    status:       'finalized',
    finalized_at: new Date().toISOString(),
    finalized_by: userId,
  }
  const { data, error } = await supabase
    .from('payroll_runs')
    .update(patch as never)
    .eq('id', runId).eq('org_id', orgId)
    .select('*').single()
  if (error) throw error
  return data as PayrollRun
}

export async function deleteRun(
  supabase: Supabase,
  orgId:    string,
  runId:    string,
): Promise<void> {
  const existing = await getRun(supabase, orgId, runId)
  if (!existing) return
  if (existing.status === 'finalized') {
    throw new Error('Finalized runs cannot be deleted')
  }
  const { error } = await supabase
    .from('payroll_runs')
    .delete()
    .eq('id', runId).eq('org_id', orgId)
  if (error) throw error
}
