import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'
import type { Icp, IcpChangelogEntry, IcpCompetency, IcpDraftInput, IcpMustHave } from '@/lib/types/icp'
import { embedText } from '@/lib/ai/llm'
import { icpEmbeddingText } from '@/lib/ai/embeddings'
import { logger } from '@/lib/logger'

type Supabase = SupabaseClient<Database>

// The `icps` table (migration 104) isn't in the generated Supabase types yet, so
// use a loose handle for it — same approach as candidate_ai_summaries.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LooseSb = any

/** Coarse "why does this version exist" from the draft source. PURE. */
function causeFromSource(source?: string | null): string {
  switch (source) {
    case 'refinement': return 'feedback'
    case 'template': return 'template'
    case 'manual': return 'manual'
    default: return 'generation' // seed | intake
  }
}

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
  opts?: { createdBy?: string | null; derivedFrom?: Record<string, unknown> },
): Promise<Icp> {
  const sb = supabase as unknown as LooseSb

  const last = await sb
    .from('icps')
    .select('id, version')
    .eq('org_id', orgId)
    .eq('job_id', jobId)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (last.error) throw last.error
  const parentId = (last.data?.id as string | undefined) ?? null
  const parentVersion = (last.data?.version as number | undefined) ?? null
  const version = (parentVersion ?? 0) + 1

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
      // Complete lineage on EVERY version (not just refinements), so the evolution
      // timeline is a clean chain, and record why this version exists.
      supersedes_id: parentId,
      derived_from: opts?.derivedFrom ?? { cause: causeFromSource(input.source), parent_version: parentVersion },
      created_by: opts?.createdBy ?? null,
    })
    .select()
    .single()
  if (error) throw error

  // Persist the per-version ICP "meaning fingerprint" for job-to-job similarity +
  // meaning-drift analysis. Best-effort — never block ICP creation on the embed call.
  try {
    const vec = await embedText(icpEmbeddingText({ competencies: input.competencies, must_haves: input.must_haves }))
    await sb.from('icps').update({ embedding: vec }).eq('id', (data as Icp).id).eq('org_id', orgId)
  } catch (err) {
    logger.warn('ICP embedding failed', { jobId, error: err instanceof Error ? err.message : String(err) })
  }

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

// ── ICP evolution (the timeline) ─────────────────────────────────────────────────

export interface IcpVersionDiff {
  weight_changes: { id: string | null; name: string; from: number; to: number }[]
  competencies_added: string[]
  competencies_removed: string[]
  gates_added: string[]
  gates_removed: string[]
}

export interface IcpEvolutionStep {
  version: number
  status: string
  source: string
  cause: string | null
  parent_version: number | null
  created_at: string | null
  competencies: { id: string; name: string; weight: number }[]
  gate_labels: string[]
  diff: IcpVersionDiff | null // vs the previous version; null for the first
}

/** Diff two consecutive ICP versions — what a recruiter changed between them. PURE. */
export function diffIcpVersions(
  prev: { competencies: IcpCompetency[]; must_haves: IcpMustHave[] },
  curr: { competencies: IcpCompetency[]; must_haves: IcpMustHave[] },
): IcpVersionDiff {
  const key = (c: IcpCompetency) => (c.id || c.name.trim().toLowerCase())
  const prevComp = new Map(prev.competencies.map((c) => [key(c), c]))
  const currComp = new Map(curr.competencies.map((c) => [key(c), c]))

  const weight_changes: IcpVersionDiff['weight_changes'] = []
  Array.from(currComp.entries()).forEach(([k, c]) => {
    const p = prevComp.get(k)
    if (p && p.weight !== c.weight) weight_changes.push({ id: c.id ?? null, name: c.name, from: p.weight, to: c.weight })
  })
  const competencies_added = Array.from(currComp.values()).filter((c) => !prevComp.has(key(c))).map((c) => c.name)
  const competencies_removed = Array.from(prevComp.values()).filter((c) => !currComp.has(key(c))).map((c) => c.name)

  const prevGates = new Set(prev.must_haves.map((g) => g.label.trim().toLowerCase()))
  const currGates = new Set(curr.must_haves.map((g) => g.label.trim().toLowerCase()))
  const gates_added = curr.must_haves.filter((g) => !prevGates.has(g.label.trim().toLowerCase())).map((g) => g.label)
  const gates_removed = prev.must_haves.filter((g) => !currGates.has(g.label.trim().toLowerCase())).map((g) => g.label)

  return { weight_changes, competencies_added, competencies_removed, gates_added, gates_removed }
}

/**
 * The full evolution of a job's ICP: every version oldest→newest, each with its
 * weighted competencies + gates, why it exists, and the diff vs the version before.
 */
export async function getIcpEvolution(supabase: Supabase, orgId: string, jobId: string): Promise<IcpEvolutionStep[]> {
  const versions = await getIcpVersions(supabase, orgId, jobId)
  const asc = [...versions].sort((a, b) => a.version - b.version)
  return asc.map((icp, i) => {
    const prev = i > 0 ? asc[i - 1] : null
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const derived = (icp as any).derived_from as { cause?: string } | null | undefined
    return {
      version: icp.version,
      status: icp.status,
      source: icp.source,
      cause: derived?.cause ?? null,
      parent_version: prev?.version ?? null,
      created_at: icp.created_at ?? null,
      competencies: icp.competencies.map((c) => ({ id: c.id, name: c.name, weight: c.weight })),
      gate_labels: (icp.must_haves ?? []).map((g) => g.label),
      diff: prev ? diffIcpVersions(prev, icp) : null,
    }
  })
}
