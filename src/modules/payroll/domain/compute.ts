/**
 * Compute orchestrator — generates draft payslips for a payroll run.
 *
 * For each active employee with current compensation:
 *   1. load comp record + tax regime override + (old-regime) declaration
 *   2. count LWP days overlapping the run period
 *   3. run the country tax engine
 *   4. emit a draft Payslip
 *
 * Employees without current comp are skipped; the orchestrator returns a
 * report so the UI can show "scored 8/10 employees, skipped 2 (no comp)".
 *
 * The orchestrator does NOT write to the DB on its own — it returns plans.
 * The route layer decides whether to preview them, write, or both. This
 * lets the UI show a confirmation modal before payslips appear, and lets
 * the agent ask for approval before committing.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  CompensationRecord,
  Database,
  EmployeeProfile,
  PayslipBreakdown,
} from '@/lib/types/database'
import { lwpDaysForPeriod }       from './tax/lwp'
import { getTaxEngine, fyFromDate } from './tax/registry'
import { getOrCreateSettings }     from './settings'
import { getDeclaration }          from './declarations'
import type { TaxComputeOutput }   from './tax/types'

type Supabase = SupabaseClient<Database>

// ── Per-employee plan ───────────────────────────────────────────────────────

export interface PayslipPlan {
  employee_id:    string
  employee_name:  string | null
  employee_email: string | null
  /** undefined when we successfully computed a plan; set when we skipped. */
  skip_reason?:   'no_comp_record' | 'inactive' | 'engine_error'
  /** Set on engine_error / no_comp_record so the UI can surface why. */
  error?:         string
  /** When skip_reason is set, this is null. */
  computed?:      TaxComputeOutput
  /** Days of LWP that contributed to the deduction (for UI display). */
  lwp_days?:      number
}

export interface RunComputePlan {
  run_id:        string
  period_start:  string
  period_end:    string
  period_days:   number
  fy:            string
  engine:        string
  regime_default: 'new' | 'old'
  plans:         PayslipPlan[]
  scored:        number
  skipped:       number
}

function daysInclusive(start: string, end: string): number {
  const s = new Date(start + 'T00:00:00Z')
  const e = new Date(end   + 'T00:00:00Z')
  const diff = Math.round((e.getTime() - s.getTime()) / 86_400_000)
  return Math.max(1, diff + 1)
}

// Derive Payroll v1.2's 80DDB senior flag from DOB if the employee hasn't set
// it explicitly. Returns a shallow-merged copy. An explicit 80ddb_senial=1 in
// other_exemptions is preserved (employee may be claiming treatment for a
// senior dependent while themselves being under 60).
function deriveOtherExemptions(
  existing: Record<string, number> | undefined,
  dob:      string | null,
  asOf:     string,                                             // YYYY-MM-DD; use the period_end so claims line up with the run
): Record<string, number> {
  const out = { ...(existing ?? {}) }
  // Explicit value wins.
  if (out['80ddb_senior'] !== undefined && Number(out['80ddb_senior']) > 0) return out
  if (!dob) return out

  const dobMs   = new Date(dob + 'T00:00:00Z').getTime()
  const asOfMs  = new Date(asOf + 'T00:00:00Z').getTime()
  if (!Number.isFinite(dobMs) || !Number.isFinite(asOfMs)) return out

  const ageYears = (asOfMs - dobMs) / (365.25 * 86_400_000)
  if (ageYears >= 60) out['80ddb_senior'] = 1
  return out
}

// Read latest compensation record directly from the canonical DB. We don't
// import from hris/ (boundary rule); the canonical schema is shared.
async function currentCompFor(
  supabase: Supabase,
  orgId:    string,
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

// ── Plan builder ────────────────────────────────────────────────────────────

export async function planRunCompute(
  supabase: Supabase,
  orgId:    string,
  runId:    string,
): Promise<RunComputePlan> {
  // 1. Run + settings
  const { data: run, error: runErr } = await supabase
    .from('payroll_runs')
    .select('id, period_start, period_end, status')
    .eq('org_id', orgId).eq('id', runId)
    .maybeSingle()
  if (runErr)  throw runErr
  if (!run)    throw new Error('Payroll run not found')
  const r = run as { id: string; period_start: string; period_end: string; status: string }
  if (r.status === 'finalized') throw new Error('Run is finalized; cannot recompute')

  const settings = await getOrCreateSettings(supabase, orgId)
  const engine   = getTaxEngine(settings.country_code)
  const periodDays = daysInclusive(r.period_start, r.period_end)
  const fy = fyFromDate(r.period_start)

  // 2. Active employees with display name/email + DOB (for 80DDB derivation).
  const { data: empData, error: empErr } = await supabase
    .from('employee_profiles')
    .select('id, status, tax_regime, date_of_birth, person:people(name, email)')
    .eq('org_id', orgId)
    .eq('status', 'active')
  if (empErr) throw empErr
  type EmpRow = Pick<EmployeeProfile, 'id' | 'status' | 'tax_regime' | 'date_of_birth'> & {
    person: { name: string | null; email: string | null } | null
  }
  const employees = (empData ?? []) as unknown as EmpRow[]

  // 3. Per-employee compute
  const plans: PayslipPlan[] = []
  for (const e of employees) {
    const planBase: PayslipPlan = {
      employee_id:    e.id,
      employee_name:  e.person?.name  ?? null,
      employee_email: e.person?.email ?? null,
    }

    const comp = await currentCompFor(supabase, orgId, e.id)
    if (!comp) {
      plans.push({ ...planBase, skip_reason: 'no_comp_record', error: 'No active compensation record' })
      continue
    }

    const lwpDays = await lwpDaysForPeriod(supabase, orgId, e.id, r.period_start, r.period_end)

    let declaration = null as Awaited<ReturnType<typeof getDeclaration>>
    if (e.tax_regime === 'old') {
      declaration = await getDeclaration(supabase, orgId, e.id, fy)
    }

    try {
      const computed = engine.compute({
        annualBaseSalary: Number((comp as CompensationRecord).base_salary),
        payFrequency:     (comp as CompensationRecord).pay_frequency,
        regime:           e.tax_regime,
        periodsPerYear:   12,                                   // monthly assumption v1
        periodDays,
        lwpDays,
        settings,
        declaration:      declaration
          ? {
              rent_paid_annual: Number(declaration.rent_paid_annual),
              section_80c:      Number(declaration.section_80c),
              section_80d:      Number(declaration.section_80d),
              section_80ccd_1b: Number(declaration.section_80ccd_1b),
              // Auto-derive 80DDB senior flag from DOB when the employee
              // hasn't ticked the checkbox themselves. Explicit takes
              // precedence: a senior treating a non-senior dependent might
              // legitimately leave the flag off.
              other_exemptions: deriveOtherExemptions(declaration.other_exemptions, e.date_of_birth, r.period_end),
            }
          : null,
      })
      plans.push({ ...planBase, computed, lwp_days: lwpDays })
    } catch (err) {
      plans.push({ ...planBase, skip_reason: 'engine_error', error: err instanceof Error ? err.message : 'compute failed' })
    }
  }

  const scored  = plans.filter(p => !p.skip_reason).length
  const skipped = plans.length - scored

  return {
    run_id:         r.id,
    period_start:   r.period_start,
    period_end:     r.period_end,
    period_days:    periodDays,
    fy,
    engine:         engine.id,
    regime_default: settings.default_tax_regime,
    plans,
    scored,
    skipped,
  }
}

// ── Plan writer ─────────────────────────────────────────────────────────────

export interface WriteOptions {
  /** Skip employees who already have a payslip on the run (do not overwrite).
   *  Default true. The admin UI exposes a "Recompute (overwrite)" toggle. */
  preserveExisting?: boolean
}

export interface WriteResult {
  written:   number
  skipped:   number
  overwrote: number
  errors:    { employee_id: string; error: string }[]
}

/** Materialise the plan into payslip rows. Refuses on finalized runs (engine
 *  also refuses to even plan, so this is double-defence). */
export async function writeRunCompute(
  supabase: Supabase,
  orgId:    string,
  plan:     RunComputePlan,
  options:  WriteOptions = {},
): Promise<WriteResult> {
  const preserveExisting = options.preserveExisting ?? true
  const result: WriteResult = { written: 0, skipped: 0, overwrote: 0, errors: [] }

  // Look up existing payslips on this run for quick filtering.
  const { data: existing, error: existingErr } = await supabase
    .from('payslips')
    .select('id, employee_id')
    .eq('org_id', orgId)
    .eq('run_id', plan.run_id)
  if (existingErr) throw existingErr
  const existingByEmployee = new Map<string, string>()
  for (const row of (existing ?? []) as Array<{ id: string; employee_id: string }>) {
    existingByEmployee.set(row.employee_id, row.id)
  }

  for (const p of plan.plans) {
    if (!p.computed) {
      result.skipped += 1
      continue
    }
    const hadExisting = existingByEmployee.has(p.employee_id)
    if (hadExisting && preserveExisting) {
      result.skipped += 1
      continue
    }

    const breakdown: PayslipBreakdown = {
      earnings:   p.computed.earnings  .filter(l => !l.informational).map(l => ({ label: l.label, amount: l.amount })),
      deductions: p.computed.deductions.filter(l => !l.informational).map(l => ({ label: l.label, amount: l.amount })),
    }
    // Attach engine metadata so the payslip carries provenance — useful when
    // someone later asks "how was this computed?" or "what slab table?".
    // Stored as extra keys; readers ignore unknown keys gracefully.
    const enrichedBreakdown = {
      ...breakdown,
      _meta:                p.computed.meta,
      _informational_lines: p.computed.deductions.filter(l => l.informational),
    } as PayslipBreakdown                                       // upcast; jsonb tolerates extras

    const row = {
      org_id:                  orgId,
      run_id:                  plan.run_id,
      employee_id:             p.employee_id,
      employee_name_snapshot:  p.employee_name,
      employee_email_snapshot: p.employee_email,
      gross:                   p.computed.gross,
      deductions_total:        p.computed.deductionsTotal,
      net:                     p.computed.net,
      breakdown:               enrichedBreakdown,
      notes:                   p.lwp_days ? `${p.lwp_days} LWP day(s) deducted.` : null,
    }

    const { error } = await supabase
      .from('payslips')
      .upsert(row as never, { onConflict: 'run_id,employee_id' })
    if (error) { result.errors.push({ employee_id: p.employee_id, error: error.message }); continue }
    if (hadExisting) result.overwrote += 1
    result.written += 1
  }

  return result
}
