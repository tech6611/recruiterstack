// A job inherits compensation + location from its requisition (migration 144),
// at creation and when a requisition is linked. Overridable on the job later.

import type { SupabaseClient } from '@supabase/supabase-js'
import { logger } from '@/lib/logger'
import { resolveLocationParts } from '@/modules/pool/domain/normalize'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = any

export type InheritedJobFields = { comp_min: number | null; comp_max: number | null; comp_currency: string | null; location_id: string | null }

export async function inheritedFromOpening(supabase: SupabaseClient, orgId: string, openingId: string): Promise<InheritedJobFields> {
  const { data } = await (supabase as unknown as Loose).from('openings')
    .select('comp_min, comp_max, comp_currency, location_id').eq('id', openingId).eq('org_id', orgId).maybeSingle()
  return {
    comp_min: data?.comp_min ?? null, comp_max: data?.comp_max ?? null,
    comp_currency: data?.comp_currency ?? null, location_id: data?.location_id ?? null,
  }
}

/** Fill the job's comp/location from the opening where the job has none. Tolerates migration 144 not applied. */
export async function fillJobFromOpening(supabase: SupabaseClient, orgId: string, jobId: string, openingId: string): Promise<void> {
  const sb = supabase as unknown as Loose
  const { data: job, error } = await sb.from('jobs').select('comp_min, comp_max, comp_currency, location_id').eq('id', jobId).eq('org_id', orgId).maybeSingle()
  if (error || !job) return   // pre-migration: columns missing → nothing to inherit into
  const inh = await inheritedFromOpening(supabase, orgId, openingId)
  const patch: Record<string, unknown> = {}
  if (job.comp_min == null && job.comp_max == null && (inh.comp_min != null || inh.comp_max != null)) {
    patch.comp_min = inh.comp_min; patch.comp_max = inh.comp_max; patch.comp_currency = inh.comp_currency
  }
  if (!job.location_id && inh.location_id) patch.location_id = inh.location_id
  if (!Object.keys(patch).length) return
  const { error: e2 } = await sb.from('jobs').update(patch).eq('id', jobId).eq('org_id', orgId)
  if (e2) logger.warn('[jobs] inherit from opening failed', { jobId, error: e2.message })
}

/** Find (case-insensitive) or create a location by display name. Returns null for blank names. */
export async function findOrCreateLocation(supabase: SupabaseClient, orgId: string, name: string | null | undefined): Promise<string | null> {
  const n = (name ?? '').trim()
  if (!n) return null
  const sb = supabase as unknown as Loose
  const { data: found } = await sb.from('locations').select('id').eq('org_id', orgId).ilike('name', n).limit(1).maybeSingle()
  if (found?.id) return found.id as string
  // A location created from a free-text intake or source-plan edit must still be
  // usable by market sourcing. Populate the structured geography when our city
  // dictionary recognises it; a name-only row cannot produce a CrustData geo filter.
  const parts = resolveLocationParts(n)
  const { data: created, error } = await sb.from('locations').insert({
    org_id: orgId,
    name: n,
    city: parts?.city ?? null,
    state: parts?.region ?? null,
    country: parts?.country ?? null,
  }).select('id').single()
  if (error) { logger.warn('[jobs] create location failed', { name: n, error: error.message }); return null }
  return (created?.id as string) ?? null
}

/**
 * Keep the pre-canonical intake text as a compatibility mirror of jobs.location_id.
 * It must never be an independent market after a structured location exists.
 */
export async function syncJobLocationIntakeMirror(
  supabase: SupabaseClient,
  orgId: string,
  jobId: string,
): Promise<void> {
  const sb = supabase as unknown as Loose
  const { data: job, error } = await sb
    .from('jobs')
    .select('custom_fields, location:locations(name)')
    .eq('id', jobId)
    .eq('org_id', orgId)
    .maybeSingle()
  if (error || !job) {
    if (error) logger.warn('[jobs] could not synchronise intake location', { jobId, error: error.message })
    return
  }

  const current = (job.custom_fields ?? {}) as Record<string, unknown>
  const intake = (current.intake ?? {}) as Record<string, unknown>
  const name = typeof job.location?.name === 'string' && job.location.name.trim() ? job.location.name.trim() : null
  if (intake.location === name) return

  const { error: updateError } = await sb
    .from('jobs')
    .update({ custom_fields: { ...current, intake: { ...intake, location: name } } })
    .eq('id', jobId)
    .eq('org_id', orgId)
  if (updateError) logger.warn('[jobs] could not mirror canonical location into intake', { jobId, error: updateError.message })
}
