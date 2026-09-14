// The hiring manager flows from the requisition (openings.hiring_manager_id)
// onto the job (jobs.hiring_manager_user_id) — the real account link that
// gates job access (rbac.canViewJob) and routes interview-plan approvals.
// The Overview "Hiring manager" picker remains as an override: an HM already
// set on the job is never overwritten by a later link.

import type { SupabaseClient } from '@supabase/supabase-js'

/** Pure decision: which user id (if any) to write onto the job. `null` = leave as-is. */
export function pickHiringManagerForJob(input: {
  currentJobHm: string | null | undefined
  openingHm: string | null | undefined
}): string | null {
  if (input.currentJobHm) return null
  return input.openingHm || null
}

// jobs.hiring_manager_user_id (migration 100) isn't in the generated types.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = any

/**
 * After linking `openingId` to `jobId`: if the job has no hiring manager yet
 * and the opening names one, copy it across. Returns the id written, or null.
 * Never throws — a failure here must not break the link itself.
 */
export async function flowHiringManagerFromOpening(
  supabase: SupabaseClient, orgId: string, jobId: string, openingId: string,
): Promise<string | null> {
  const sb = supabase as unknown as Loose
  try {
    const [{ data: job }, { data: opening }] = await Promise.all([
      sb.from('jobs').select('hiring_manager_user_id').eq('id', jobId).eq('org_id', orgId).maybeSingle(),
      sb.from('openings').select('hiring_manager_id').eq('id', openingId).eq('org_id', orgId).maybeSingle(),
    ])
    const next = pickHiringManagerForJob({
      currentJobHm: (job as { hiring_manager_user_id?: string | null } | null)?.hiring_manager_user_id,
      openingHm: (opening as { hiring_manager_id?: string | null } | null)?.hiring_manager_id,
    })
    if (!next) return null
    const { error } = await sb.from('jobs').update({ hiring_manager_user_id: next }).eq('id', jobId).eq('org_id', orgId)
    return error ? null : next
  } catch {
    return null
  }
}
