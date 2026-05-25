import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'
import type { Opening } from '@/lib/types/requisitions'

type Supabase = SupabaseClient<Database>

export async function getOpeningById(
  supabase: Supabase,
  orgId: string,
  openingId: string,
): Promise<Opening | null> {
  const { data, error } = await supabase
    .from('openings')
    .select('*')
    .eq('org_id', orgId)
    .eq('id', openingId)
    .maybeSingle()

  if (error) throw error
  return data as Opening | null
}
