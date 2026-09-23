import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'
import type { ExperimentDecision, ExperimentVariant, ExperimentVariantKey, SourcingExperiment } from '@/lib/types/sourcing-experiment'

type Supabase = SupabaseClient<Database>
// sourcing_experiments is introduced after generated database types.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LooseSb = any

const EMPTY_VARIANT = (label: string, prompt_version: 'current' | 'challenger'): ExperimentVariant => ({ label, prompt_version, candidates: [] })

export async function createSourcingExperiment(
  supabase: Supabase,
  orgId: string,
  jobId: string,
  countPerVariant: number,
  createdBy?: string | null,
): Promise<SourcingExperiment> {
  const { data, error } = await (supabase as unknown as LooseSb)
    .from('sourcing_experiments')
    .insert({
      org_id: orgId,
      job_id: jobId,
      count_per_variant: countPerVariant,
      created_by: createdBy ?? null,
      baseline: EMPTY_VARIANT('Current sourcing strategy', 'current'),
      challenger: EMPTY_VARIANT('Challenger strategy', 'challenger'),
    })
    .select()
    .single()
  if (error) throw error
  return data as SourcingExperiment
}

export async function finishSourcingExperiment(
  supabase: Supabase,
  orgId: string,
  id: string,
  variants: Pick<SourcingExperiment, 'baseline' | 'challenger'>,
): Promise<SourcingExperiment> {
  const { data, error } = await (supabase as unknown as LooseSb)
    .from('sourcing_experiments')
    .update({ ...variants, status: 'completed', completed_at: new Date().toISOString(), error: null })
    .eq('org_id', orgId).eq('id', id).select().single()
  if (error) throw error
  return data as SourcingExperiment
}

export async function failSourcingExperiment(supabase: Supabase, orgId: string, id: string, errorMessage: string): Promise<void> {
  const { error } = await (supabase as unknown as LooseSb)
    .from('sourcing_experiments')
    .update({ status: 'failed', error: errorMessage.slice(0, 1000), completed_at: new Date().toISOString() })
    .eq('org_id', orgId).eq('id', id)
  if (error) throw error
}

export async function listSourcingExperiments(supabase: Supabase, orgId: string, jobId: string): Promise<SourcingExperiment[]> {
  const { data, error } = await (supabase as unknown as LooseSb)
    .from('sourcing_experiments').select('*').eq('org_id', orgId).eq('job_id', jobId)
    .order('created_at', { ascending: false }).limit(12)
  if (error) throw error
  return (data ?? []) as SourcingExperiment[]
}

/** Cross-job experiment history for the Sourcing Lab dashboard. */
export async function listOrgSourcingExperiments(supabase: Supabase, orgId: string): Promise<(SourcingExperiment & { job?: { title?: string | null } | null })[]> {
  const { data, error } = await (supabase as unknown as LooseSb)
    .from('sourcing_experiments').select('*, job:jobs(title)').eq('org_id', orgId)
    .order('created_at', { ascending: false }).limit(100)
  if (error) throw error
  return (data ?? []) as (SourcingExperiment & { job?: { title?: string | null } | null })[]
}

export async function setExperimentDecision(
  supabase: Supabase,
  orgId: string,
  jobId: string,
  experimentId: string,
  variant: ExperimentVariantKey,
  profileId: string,
  decision: ExperimentDecision,
): Promise<SourcingExperiment> {
  const sb = supabase as unknown as LooseSb
  const { data: row, error: readError } = await sb.from('sourcing_experiments').select('baseline, challenger').eq('org_id', orgId).eq('job_id', jobId).eq('id', experimentId).maybeSingle()
  if (readError) throw readError
  if (!row) throw new Error('Sourcing experiment not found')
  const next = { ...(row[variant] as ExperimentVariant) }
  next.candidates = (next.candidates ?? []).map((candidate) => candidate.profile_id === profileId ? { ...candidate, decision } : candidate)
  const { data, error } = await sb.from('sourcing_experiments').update({ [variant]: next }).eq('org_id', orgId).eq('job_id', jobId).eq('id', experimentId).select().single()
  if (error) throw error
  return data as SourcingExperiment
}
