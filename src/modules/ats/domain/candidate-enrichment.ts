import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'
import { RESUME_BUCKET, resumeStoragePath, resumeExt } from '@/lib/storage/resume'
import { embedText } from '@/lib/ai/llm'
import { enrichFromPdf, deriveMovability, normalizeEducationLevel, type EnrichedProfile } from '@/lib/ai/candidate-enrichment'
import type { CandidateHistory } from '@/lib/ai/fit-engine'
import type { UsageIdentity } from '@/lib/ai/track-usage'
import { logger } from '@/lib/logger'

type Supabase = SupabaseClient<Database>
// candidate_experiences (migration 114) + candidates.embedding/education/enriched_at
// aren't in the generated types yet — loose handle, same as elsewhere.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LooseSb = any

export type EnrichResult =
  | { status: 'enriched'; roles: number; education: number }
  | { status: 'skipped'; reason: 'no_resume' | 'external_resume' | 'unsupported_format' | 'not_found' }
  | { status: 'error'; message: string }

/** Persist an enriched profile: replace the dated history, store education, refresh
 *  the flat fields (only where enrichment found a value) + the semantic embedding. */
export async function saveCandidateEnrichment(
  supabase: Supabase,
  orgId: string,
  candidateId: string,
  enriched: EnrichedProfile,
): Promise<void> {
  const sb = supabase as unknown as LooseSb

  // Replace the dated work history.
  await sb.from('candidate_experiences').delete().eq('candidate_id', candidateId).eq('org_id', orgId)
  if (enriched.experiences.length) {
    await sb.from('candidate_experiences').insert(
      enriched.experiences.map((e, i) => ({
        org_id: orgId,
        candidate_id: candidateId,
        title: e.title,
        employer: e.employer,
        location: e.location,
        start_date: e.start_date,
        end_date: e.end_date,
        is_current: e.is_current,
        summary: e.summary,
        sort_order: i,
      })),
    )
  }

  // Update flat fields where enrichment found something better; keep existing otherwise.
  const patch: Record<string, unknown> = { education: enriched.education, enriched_at: new Date().toISOString() }
  if (enriched.current_title) patch.current_title = enriched.current_title
  if (enriched.current_company) patch.current_company = enriched.current_company
  if (enriched.location) patch.location = enriched.location
  if (enriched.skills.length) patch.skills = enriched.skills
  if (typeof enriched.experience_years === 'number') patch.experience_years = enriched.experience_years
  await sb.from('candidates').update(patch).eq('id', candidateId).eq('org_id', orgId)

  // Refresh the semantic embedding from the richer profile (best-effort).
  try {
    const text = enrichmentEmbeddingText(enriched)
    if (text) {
      const embedding = await embedText(text)
      await sb.from('candidates').update({ embedding }).eq('id', candidateId).eq('org_id', orgId)
    }
  } catch (err) {
    logger.warn('Enrichment: embedding refresh failed', { candidateId, error: err instanceof Error ? err.message : String(err) })
  }
}

/** Text fed to the embedding — now includes past employers/titles, not just current. */
function enrichmentEmbeddingText(e: EnrichedProfile): string {
  const roles = e.experiences.slice(0, 6).map((x) => [x.title, x.employer].filter(Boolean).join(' at ')).filter(Boolean)
  return [
    [e.current_title, e.current_company].filter(Boolean).join(' at '),
    e.skills.slice(0, 20).join(', '),
    roles.join(' · '),
  ].filter(Boolean).join('\n').trim()
}

/**
 * Enrich ONE candidate from their stored résumé PDF. Path-agnostic: works for any
 * candidate with a résumé regardless of which ingestion flow created them. Skips
 * gracefully (never throws) when there's no usable PDF to read.
 */
export async function enrichCandidateById(
  supabase: Supabase,
  orgId: string,
  candidateId: string,
  identity: UsageIdentity = {},
): Promise<EnrichResult> {
  const sb = supabase as unknown as LooseSb
  const { data: cand } = await sb
    .from('candidates').select('id, resume_url').eq('id', candidateId).eq('org_id', orgId).maybeSingle()
  if (!cand) return { status: 'skipped', reason: 'not_found' }
  if (!cand.resume_url) return { status: 'skipped', reason: 'no_resume' }

  const path = resumeStoragePath(cand.resume_url)
  if (!path) return { status: 'skipped', reason: 'external_resume' } // e.g. a Google Drive link
  if (resumeExt(path) !== 'pdf') return { status: 'skipped', reason: 'unsupported_format' } // office docs: convert later

  try {
    const dl = await sb.storage.from(RESUME_BUCKET).download(path)
    if (dl.error || !dl.data) return { status: 'skipped', reason: 'not_found' }
    const base64 = Buffer.from(await dl.data.arrayBuffer()).toString('base64')
    const enriched = await enrichFromPdf(base64, identity)
    await saveCandidateEnrichment(supabase, orgId, candidateId, enriched)
    return { status: 'enriched', roles: enriched.experiences.length, education: enriched.education.length }
  } catch (err) {
    logger.error('Candidate enrichment failed', err, { candidateId })
    return { status: 'error', message: err instanceof Error ? err.message : 'enrichment failed' }
  }
}

/**
 * Batch-fetch education + dated work history for many candidates — the evidence the
 * Fit Engine needs to judge a background/identity deal-breaker. Two queries total.
 */
export async function getCandidatesHistory(
  supabase: Supabase,
  orgId: string,
  candidateIds: string[],
): Promise<Map<string, CandidateHistory>> {
  const map = new Map<string, CandidateHistory>()
  const ids = Array.from(new Set(candidateIds.filter(Boolean)))
  if (ids.length === 0) return map
  const sb = supabase as unknown as LooseSb
  const [{ data: cands }, { data: exps }] = await Promise.all([
    sb.from('candidates').select('id, education').eq('org_id', orgId).in('id', ids),
    sb.from('candidate_experiences')
      .select('candidate_id, title, employer, start_date, end_date, is_current, sort_order')
      .eq('org_id', orgId).in('candidate_id', ids).order('sort_order', { ascending: true }),
  ])
  type Edu = NonNullable<CandidateHistory['education']>
  type Exp = NonNullable<CandidateHistory['experiences']>
  const eduById = new Map<string, Edu>()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const c of (cands ?? []) as any[]) {
    // Infer the normalized level from the degree for rows enriched before the level
    // field existed — so the recruiter-brain gets it without a re-enrich.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const edu = ((c.education ?? []) as any[]).map((e) => ({ ...e, level: e.level ?? normalizeEducationLevel(e.degree ?? e.field) }))
    eduById.set(c.id, edu as Edu)
  }
  const expsById = new Map<string, Exp>()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const e of (exps ?? []) as any[]) {
    const arr = expsById.get(e.candidate_id) ?? ([] as Exp)
    arr.push({ title: e.title, employer: e.employer, start_date: e.start_date, end_date: e.end_date, is_current: e.is_current })
    expsById.set(e.candidate_id, arr)
  }
  for (const id of ids) map.set(id, { education: eduById.get(id) ?? [], experiences: expsById.get(id) ?? [] })
  return map
}

/** Read a candidate's enriched history + derived movability (for the profile UI). */
export async function getCandidateHistory(
  supabase: Supabase,
  orgId: string,
  candidateId: string,
): Promise<{ experiences: EnrichedProfile['experiences']; education: EnrichedProfile['education']; movability: ReturnType<typeof deriveMovability>; enriched_at: string | null }> {
  const sb = supabase as unknown as LooseSb
  const [{ data: rows }, { data: cand }] = await Promise.all([
    sb.from('candidate_experiences').select('*').eq('candidate_id', candidateId).eq('org_id', orgId).order('sort_order', { ascending: true }),
    sb.from('candidates').select('education, enriched_at').eq('id', candidateId).eq('org_id', orgId).maybeSingle(),
  ])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const experiences = (rows ?? []).map((r: any) => ({
    title: r.title, employer: r.employer, location: r.location,
    start_date: r.start_date, end_date: r.end_date, is_current: r.is_current, summary: r.summary,
  }))
  return {
    experiences,
    education: cand?.education ?? [],
    movability: deriveMovability(experiences, new Date()),
    enriched_at: cand?.enriched_at ?? null,
  }
}
