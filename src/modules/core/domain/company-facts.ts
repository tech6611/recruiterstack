import type { SupabaseClient } from '@supabase/supabase-js'
import { normalizeName } from '@/lib/brand-icon'
import type { CompanyFacts, CompanyFactsMap } from '@/lib/company-facts'

/**
 * Read `company_facts` for a set of employer names.
 *
 * IN CORE because both the ATS and the pool describe the same employers, and core is
 * the one place a module may import from without reaching sideways into another.
 *
 * NO org_id, DELIBERATELY. A company's industry and headcount are the same fact for
 * every tenant, exactly like `brand_domains` — see migration 153. There is nothing here
 * to scope, and scoping it would mean enriching the same 837 employers once per
 * customer.
 *
 * Employers are looked up by the SAME normalized key the logo lookup uses, so one
 * spelling resolves to both a company's mark and its facts.
 */
export async function loadCompanyFacts(
  supabase: SupabaseClient,
  employers: (string | null | undefined)[],
): Promise<CompanyFactsMap> {
  const keys = Array.from(
    new Set(employers.map((e) => (e ? normalizeName(e, 'company') : '')).filter(Boolean)),
  )
  if (!keys.length) return {}

  const { data, error } = await supabase
    .from('company_facts')
    .select('name_norm,display_name,industries,employees,founded_year,latest_stage')
    .in('name_norm', keys)

  // A profile still renders without company chips; a failed lookup must not take the
  // whole profile down with it.
  if (error || !data) return {}

  const map: CompanyFactsMap = {}
  for (const row of data as unknown as CompanyFacts[]) map[row.name_norm] = row
  return map
}
