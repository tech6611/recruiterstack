import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  Database,
  PayrollOrgSettings,
  PayrollOrgSettingsUpdate,
} from '@/lib/types/database'

type Supabase = SupabaseClient<Database>

/** Read org payroll settings; create with defaults on first access so callers
 *  never have to handle the "no row yet" case. Idempotent. */
export async function getOrCreateSettings(
  supabase: Supabase,
  orgId:    string,
): Promise<PayrollOrgSettings> {
  const { data, error } = await supabase
    .from('payroll_org_settings')
    .select('*')
    .eq('org_id', orgId)
    .maybeSingle()
  if (error) throw error
  if (data) return data as PayrollOrgSettings

  // Insert default row. ON CONFLICT DO NOTHING so concurrent first-reads don't fight.
  const { error: insertErr } = await supabase
    .from('payroll_org_settings')
    .insert({ org_id: orgId } as never)
  if (insertErr && !/duplicate key/.test(insertErr.message)) throw insertErr

  const { data: fresh, error: refetchErr } = await supabase
    .from('payroll_org_settings')
    .select('*')
    .eq('org_id', orgId)
    .single()
  if (refetchErr) throw refetchErr
  return fresh as PayrollOrgSettings
}

export async function updateSettings(
  supabase: Supabase,
  orgId:    string,
  patch:    PayrollOrgSettingsUpdate,
): Promise<PayrollOrgSettings> {
  // Ensure the row exists before patching.
  await getOrCreateSettings(supabase, orgId)
  const { data, error } = await supabase
    .from('payroll_org_settings')
    .update(patch as never)
    .eq('org_id', orgId)
    .select('*')
    .single()
  if (error) throw error
  return data as PayrollOrgSettings
}
