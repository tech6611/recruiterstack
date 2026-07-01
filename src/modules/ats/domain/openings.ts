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

/** Approved requisitions for an org — the only openings a job may be created
 *  from. Used by the copilot job tool to offer a pick-list (or tell the user
 *  none exist) instead of minting a req-less job. */
export async function listApprovedOpenings(
  supabase: Supabase,
  orgId: string,
): Promise<Array<{ id: string; title: string }>> {
  const { data, error } = await supabase
    .from('openings')
    .select('id, title')
    .eq('org_id', orgId)
    .eq('status', 'approved')
    .order('created_at', { ascending: false })

  if (error) throw error
  return (data ?? []) as Array<{ id: string; title: string }>
}
