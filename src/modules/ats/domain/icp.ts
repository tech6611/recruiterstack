import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'
import type { Icp, IcpChangelogEntry, IcpDraftInput } from '@/lib/types/icp'

type Supabase = SupabaseClient<Database>

// The `icps` table (migration 104) isn't in the generated Supabase types yet, so
// use a loose handle for it — same approach as candidate_ai_summaries.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LooseSb = any

/** The live ICP for a job: the approved version, or the newest draft if none is
 *  approved yet. Returns null when the job has no ICP. */
/**
 * The LATEST ICP version for a job — draft or approved, highest version number.
 * For the ICP EDITOR only: after generating/regenerating, the newest draft (with
 * its reasoning) is what the recruiter is working on, so it must survive a refresh —
 * unlike getCurrentIcp, which returns the approved yardstick (used by scoring/sourcing).
 */
export async function getLatestIcp(
  supabase: Supabase,
  orgId: string,
  jobId: string,
): Promise<Icp | null> {
  const sb = supabase as unknown as LooseSb
  const { data, error } = await sb
    .from('icps')
    .select('*')
    .eq('org_id', orgId)
    .eq('job_id', jobId)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return (data ?? null) as Icp | null
}

export async function getCurrentIcp(
  supabase: Supabase,
  orgId: string,
  jobId: string,
): Promise<Icp | null> {
  const sb = supabase as unknown as LooseSb

  const approved = await sb
    .from('icps')
    .select('*')
    .eq('org_id', orgId)
    .eq('job_id', jobId)
    .eq('status', 'approved')
    .maybeSingle()
  if (approved.error) throw approved.error
  if (approved.data) return approved.data as Icp

  const draft = await sb
    .from('icps')
    .select('*')
    .eq('org_id', orgId)
    .eq('job_id', jobId)
    .eq('status', 'draft')
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (draft.error) throw draft.error
  return (draft.data ?? null) as Icp | null
}

/** All versions for a job, newest first (audit / history). */
export async function getIcpVersions(
  supabase: Supabase,
  orgId: string,
  jobId: string,
): Promise<Icp[]> {
  const sb = supabase as unknown as LooseSb
  const { data, error } = await sb
    .from('icps')
    .select('*')
    .eq('org_id', orgId)
    .eq('job_id', jobId)
    .order('version', { ascending: false })
  if (error) throw error
  return (data ?? []) as Icp[]
}

export async function getIcpById(
  supabase: Supabase,
  orgId: string,
  icpId: string,
): Promise<Icp | null> {
  const sb = supabase as unknown as LooseSb
  const { data, error } = await sb
    .from('icps')
    .select('*')
    .eq('org_id', orgId)
    .eq('id', icpId)
    .maybeSingle()
  if (error) throw error
  return (data ?? null) as Icp | null
}

/** Create the next draft version for a job (version = max + 1). */
export async function createIcpDraft(
  supabase: Supabase,
  orgId: string,
  jobId: string,
  input: IcpDraftInput,
  opts?: { createdBy?: string | null },
): Promise<Icp> {
  const sb = supabase as unknown as LooseSb

  const last = await sb
    .from('icps')
    .select('version')
    .eq('org_id', orgId)
    .eq('job_id', jobId)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (last.error) throw last.error
  const version = ((last.data?.version as number | undefined) ?? 0) + 1

  const changelog: IcpChangelogEntry[] = [
    {
      version,
      change: 'Created draft',
      by: opts?.createdBy ?? undefined,
      at: new Date().toISOString(),
    },
  ]

  const { data, error } = await sb
    .from('icps')
    .insert({
      org_id: orgId,
      job_id: jobId,
      version,
      status: 'draft',
      source: input.source ?? 'manual',
      must_haves: input.must_haves,
      competencies: input.competencies,
      changelog,
      created_by: opts?.createdBy ?? null,
    })
    .select()
    .single()
  if (error) throw error
  return data as Icp
}

/** Edit a draft in place. Drafts only — approved/superseded versions are frozen. */
export async function updateIcpDraft(
  supabase: Supabase,
  orgId: string,
  icpId: string,
  input: IcpDraftInput,
): Promise<Icp> {
  const sb = supabase as unknown as LooseSb
  const { data, error } = await sb
    .from('icps')
    .update({
      must_haves: input.must_haves,
      competencies: input.competencies,
      updated_at: new Date().toISOString(),
    })
    .eq('org_id', orgId)
    .eq('id', icpId)
    .eq('status', 'draft')
    .select()
    .maybeSingle()
  if (error) throw error
  if (!data) throw new Error('Draft ICP not found or not editable')
  return data as Icp
}

/** Promote a draft to the live ICP. Demotes the prior approved version first;
 *  the partial unique index guarantees only one 'approved' survives per job. The
 *  caller is responsible for writing the down-projected scoring_criteria back to
 *  the job (see the approve route). */
export async function approveIcp(
  supabase: Supabase,
  orgId: string,
  icpId: string,
  approvedBy?: string | null,
): Promise<Icp> {
  const sb = supabase as unknown as LooseSb

  const found = await sb
    .from('icps')
    .select('*')
    .eq('org_id', orgId)
    .eq('id', icpId)
    .maybeSingle()
  if (found.error) throw found.error
  if (!found.data) throw new Error('ICP not found')
  const row = found.data as Icp

  // Demote the current approved version for this job (if any, and not this one).
  const demote = await sb
    .from('icps')
    .update({ status: 'superseded' })
    .eq('org_id', orgId)
    .eq('job_id', row.job_id)
    .eq('status', 'approved')
    .neq('id', icpId)
  if (demote.error) throw demote.error

  const { data, error } = await sb
    .from('icps')
    .update({
      status: 'approved',
      approved_by: approvedBy ?? null,
      approved_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('org_id', orgId)
    .eq('id', icpId)
    .select()
    .single()
  if (error) throw error
  return data as Icp
}

/** Branch a new draft from the current ICP with the given changes + a changelog
 *  note. Used by the feedback/refinement loop (Component 03) later; included here
 *  to complete the facade. */
export async function refineIcp(
  supabase: Supabase,
  orgId: string,
  jobId: string,
  changes: Partial<IcpDraftInput>,
  note: string,
  opts?: { createdBy?: string | null },
): Promise<Icp> {
  const current = await getCurrentIcp(supabase, orgId, jobId)
  const draft = await createIcpDraft(
    supabase,
    orgId,
    jobId,
    {
      must_haves: changes.must_haves ?? current?.must_haves ?? [],
      competencies: changes.competencies ?? current?.competencies ?? [],
      source: 'refinement',
    },
    opts,
  )

  const sb = supabase as unknown as LooseSb
  const changelog: IcpChangelogEntry[] = [
    ...draft.changelog,
    { version: draft.version, change: note, by: opts?.createdBy ?? undefined, at: new Date().toISOString() },
  ]
  const { data, error } = await sb
    .from('icps')
    .update({ supersedes_id: current?.id ?? null, changelog })
    .eq('org_id', orgId)
    .eq('id', draft.id)
    .select()
    .single()
  if (error) throw error
  return data as Icp
}
