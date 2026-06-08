import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  Database,
  EmployeeTaxDeclaration,
  EmployeeTaxDeclarationInsert,
  EmployeeTaxDeclarationUpdate,
} from '@/lib/types/database'

type Supabase = SupabaseClient<Database>

export async function getDeclaration(
  supabase:   Supabase,
  orgId:      string,
  employeeId: string,
  fy:         string,
): Promise<EmployeeTaxDeclaration | null> {
  const { data, error } = await supabase
    .from('employee_tax_declarations')
    .select('*')
    .eq('org_id', orgId).eq('employee_id', employeeId).eq('fy', fy)
    .maybeSingle()
  if (error) throw error
  return (data as EmployeeTaxDeclaration) ?? null
}

export async function listDeclarationsForEmployee(
  supabase:   Supabase,
  orgId:      string,
  employeeId: string,
): Promise<EmployeeTaxDeclaration[]> {
  const { data, error } = await supabase
    .from('employee_tax_declarations')
    .select('*')
    .eq('org_id', orgId).eq('employee_id', employeeId)
    .order('fy', { ascending: false })
  if (error) throw error
  return (data ?? []) as EmployeeTaxDeclaration[]
}

export interface UpsertDeclarationInput {
  fy:                string
  rent_paid_annual?: number
  section_80c?:      number
  section_80d?:      number
  section_80ccd_1b?: number
  other_exemptions?: Record<string, number>
  notes?:            string | null
}

/** Idempotent upsert on (employee, fy). Returns the resulting row. */
export async function upsertDeclaration(
  supabase:   Supabase,
  orgId:      string,
  employeeId: string,
  input:      UpsertDeclarationInput,
): Promise<EmployeeTaxDeclaration> {
  const row: EmployeeTaxDeclarationInsert = {
    org_id:           orgId,
    employee_id:      employeeId,
    fy:               input.fy,
    rent_paid_annual: input.rent_paid_annual ?? 0,
    section_80c:      input.section_80c      ?? 0,
    section_80d:      input.section_80d      ?? 0,
    section_80ccd_1b: input.section_80ccd_1b ?? 0,
    other_exemptions: input.other_exemptions ?? {},
    notes:            input.notes            ?? null,
  }
  const { data, error } = await supabase
    .from('employee_tax_declarations')
    .upsert(row as never, { onConflict: 'employee_id,fy' })
    .select('*').single()
  if (error) throw error
  return data as EmployeeTaxDeclaration
}

/** Patch an existing declaration. Throws if it doesn't exist (use upsert instead). */
export async function updateDeclaration(
  supabase:      Supabase,
  orgId:         string,
  declarationId: string,
  patch:         EmployeeTaxDeclarationUpdate,
): Promise<EmployeeTaxDeclaration> {
  const { data, error } = await supabase
    .from('employee_tax_declarations')
    .update(patch as never)
    .eq('id', declarationId).eq('org_id', orgId)
    .select('*').single()
  if (error) throw error
  return data as EmployeeTaxDeclaration
}
