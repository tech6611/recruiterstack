import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'
import type { Icp, IcpChangelogEntry, IcpCompetency, IcpDraftInput, IcpMustHave, RecruiterBrief, SourcingMap } from '@/lib/types/icp'
import type { SearchSpec } from '@/lib/types/search-spec'
import { embedText } from '@/lib/ai/llm'
import { icpEmbeddingText } from '@/lib/ai/embeddings'
import { logger } from '@/lib/logger'
import { mustHaveFromCriterion, mustHavesFromSpec } from '@/lib/icp-gates'
import { convertLegacyGates } from '@/lib/ai/gate-evaluator'
import { getJobRoleContext } from '@/modules/ats/domain/job-role-context'

type Supabase = SupabaseClient<Database>

// The `icps` table (migration 104) isn't in the generated Supabase types yet, so
// use a loose handle for it — same approach as candidate_ai_summaries.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LooseSb = any

function canonicalLocationText(location: { name?: string | null; city?: string | null; state?: string | null; country?: string | null } | null | undefined): string | null {
  if (!location) return null
  const geographic = [location.city, location.state, location.country].filter((v): v is string => typeof v === 'string' && v.trim() !== '').join(', ')
  return geographic || (typeof location.name === 'string' && location.name.trim() ? location.name.trim() : null)
}

function syncSpecLocation(spec: SearchSpec, market: string): SearchSpec {
  const criterion = <T extends { kind: string; values: string[]; exclude?: boolean }>(c: T): T =>
    c.kind === 'location' && !c.exclude ? { ...c, values: [market] } : c
  return {
    ...spec,
    base: spec.base.map(criterion),
    levels: spec.levels.map((level) => ({ ...level, criteria: level.criteria.map(criterion) })),
  }
}

/**
 * A job location change invalidates every active ICP's geographic copy. Keep the
 * job authoritative and bring active drafts/approved ICPs (including saved source
 * plans and the recruiter-brief label) into line. Historical experiments stay as
 * immutable evidence of the market they actually searched.
 */
export async function syncActiveIcpLocationsFromJob(
  supabase: Supabase,
  orgId: string,
  jobId: string,
): Promise<void> {
  const sb = supabase as unknown as LooseSb
  const { data: job, error: jobError } = await sb
    .from('jobs')
    .select('location:locations(name, city, state, country)')
    .eq('id', jobId)
    .eq('org_id', orgId)
    .maybeSingle()
  if (jobError) throw jobError
  const market = canonicalLocationText(job?.location)
  if (!market) return

  const { data: rows, error } = await sb
    .from('icps')
    .select('id, must_haves, sourcing_map')
    .eq('org_id', orgId)
    .eq('job_id', jobId)
    .in('status', ['draft', 'approved'])
  if (error) throw error

  await Promise.all((rows ?? []).map(async (row: { id: string; must_haves?: IcpMustHave[] | null; sourcing_map?: SourcingMap | null }) => {
    let hasLocation = false
    const mustHaves = (row.must_haves ?? []).map((gate) => {
      if (gate.kind !== 'location' || gate.exclude) return gate
      hasLocation = true
      return mustHaveFromCriterion({
        id: gate.id,
        kind: 'location',
        values: [market],
        radius_km: gate.radius_km ?? 50,
        exclude: false,
        relax_at: gate.relax_at ?? null,
      })
    })
    // Older ICPs predate the ideal-profile location row. Add it so both scoring
    // and sourcing read the same canonical market after a job location change.
    if (!hasLocation) {
      mustHaves.push(mustHaveFromCriterion({
        id: 'ip-location',
        kind: 'location',
        values: [market],
        radius_km: 50,
        relax_at: 4,
      }))
    }
    const currentMap = (row.sourcing_map ?? {}) as SourcingMap & { search_spec?: SearchSpec | null }
    const brief = currentMap.recruiter_brief
      ? { ...currentMap.recruiter_brief, market }
      : currentMap.recruiter_brief
    const search_spec = currentMap.search_spec ? syncSpecLocation(currentMap.search_spec, market) : currentMap.search_spec
    const { error: updateError } = await sb.from('icps').update({
      must_haves: mustHaves,
      sourcing_map: { ...currentMap, recruiter_brief: brief, search_spec },
      updated_at: new Date().toISOString(),
    }).eq('id', row.id).eq('org_id', orgId)
    if (updateError) throw updateError
  }))
}

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
  if (approved.data) return withStructuredGates(supabase, orgId, jobId, approved.data as Icp)

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
  return draft.data ? withStructuredGates(supabase, orgId, jobId, draft.data as Icp) : null
}

/**
 * Structured must-haves (docs/structured-must-haves-plan.md): legacy free-text gates
 * are converted to criteria on read — years → band, "based in <market>" → location,
 * "primary experience in X" → the brief's title families — and gates no profile can
 * answer become `screening`. Pure and deterministic given the row, so nothing is
 * written back; the stored gates are untouched until the editor (Phase 2) saves.
 */
async function withStructuredGates(supabase: Supabase, orgId: string, jobId: string, icp: Icp): Promise<Icp> {
  const roleContext = await getJobRoleContext(supabase, orgId, jobId).catch(() => null)
  return withConvertedGates(icp, roleContext?.market ?? null)
}

/** The read-time conversion, PURE — exported for the audit script and tests. */
export function withConvertedGates(icp: Icp, market: { city?: string | null; state?: string | null; country?: string | null; work_model?: string | null } | null): Icp {
  const must_haves = convertLegacyGates(icp.must_haves, { market, titleFamilies: icp.sourcing_map?.recruiter_brief?.title_families ?? null })
  return { ...icp, must_haves }
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

/**
 * Save the recruiter's corrections to an ICP's recruiter brief (Phase 1 of niche
 * recruiter ICPs). Allowed on ANY status — corrections are house knowledge, not a
 * change to gates/weights, and they must survive on an approved ICP so the next
 * "Regenerate" starts from them. Merged into sourcing_map.recruiter_brief.corrections;
 * an ICP with no brief yet gets a minimal one so the corrections still persist.
 */
export async function setIcpRecruiterCorrections(
  supabase: Supabase,
  orgId: string,
  icpId: string,
  corrections: string,
): Promise<Icp> {
  const sb = supabase as unknown as LooseSb
  const { data: row, error: readErr } = await sb
    .from('icps')
    .select('sourcing_map')
    .eq('org_id', orgId)
    .eq('id', icpId)
    .maybeSingle()
  if (readErr) throw readErr
  if (!row) throw new Error('ICP not found')
  const sm = (row.sourcing_map ?? {}) as Partial<SourcingMap>
  const brief: RecruiterBrief = {
    niche: '', persona: '', feeder_pools: [], title_families: [], market_gates: [],
    jd_translations: [], market_norms: [], normal_red_flags: [], unsure_about: [],
    ...(sm.recruiter_brief ?? {}),
    corrections: corrections.trim() || null,
  }
  const sourcing_map = { reasoning: '', requirement_decomposition: [], unwritten_filters: [], ...sm, recruiter_brief: brief }
  const { data, error } = await sb
    .from('icps')
    .update({ sourcing_map, updated_at: new Date().toISOString() })
    .eq('org_id', orgId)
    .eq('id', icpId)
    .select()
    .maybeSingle()
  if (error) throw error
  if (!data) throw new Error('ICP not found')
  return data as Icp
}

/**
 * Save a recruiter-edited SEARCH SPEC on an ICP (any status — like corrections, it is
 * acquisition knowledge, not a change to gates/weights). Pass null to reset to the
 * brief's proposal (the stored spec is removed; the next read re-derives it).
 */
export async function setIcpSearchSpec(
  supabase: Supabase,
  orgId: string,
  icpId: string,
  spec: SearchSpec | null,
): Promise<Icp> {
  const sb = supabase as unknown as LooseSb
  const { data: row, error: readErr } = await sb.from('icps').select('sourcing_map, must_haves').eq('org_id', orgId).eq('id', icpId).maybeSingle()
  if (readErr) throw readErr
  if (!row) throw new Error('ICP not found')
  const sm = { reasoning: '', requirement_decomposition: [], unwritten_filters: [], ...((row.sourcing_map ?? {}) as Partial<SourcingMap>) } as SourcingMap & { search_spec?: SearchSpec | null }
  sm.search_spec = spec ? { ...spec, source: 'edited', edited_at: new Date().toISOString() } : null
  // The plan's base line IS the must-have list (docs/structured-must-haves-plan.md):
  // an edited base is written back as the ICP's structured must-haves.
  const patch: Record<string, unknown> = { sourcing_map: sm, updated_at: new Date().toISOString() }
  if (spec) patch.must_haves = mustHavesFromSpec((row as { must_haves?: IcpMustHave[] }).must_haves, { base: spec.base ?? [], levels: spec.levels })
  const { data, error } = await sb.from('icps').update(patch).eq('org_id', orgId).eq('id', icpId).select().maybeSingle()
  if (error) throw error
  if (!data) throw new Error('ICP not found')
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
