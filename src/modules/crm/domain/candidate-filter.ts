import type { SupabaseClient } from '@supabase/supabase-js'

// Tags that mean "never contact" (hard block) — candidates carrying any of these
// are excluded from bulk enrollment regardless of other filters.
export const DO_NOT_CONTACT_TAGS = ['do-not-contact', 'do_not_contact', 'dnc']

// Tags that suppress a candidate from cold-outreach bulk enrollment: the hard
// do-not-contact family plus the soft 'candidate-unsubscribe' tag. Unsubscribing
// only blocks cold outreach — 1:1 replies to inbound leads remain allowed.
export const COLD_OUTREACH_EXCLUDE_TAGS = [...DO_NOT_CONTACT_TAGS, 'candidate-unsubscribe']

export const APPLICATION_STATUSES = ['active', 'rejected', 'withdrawn', 'hired'] as const

export interface CandidateFilter {
  department_ids?: string[]
  job_ids?: string[]
  stage_names?: string[]
  tags?: string[]
  statuses?: string[]                 // application statuses
  exclude_do_not_contact?: boolean    // default true
}

// ── Pure combinators (unit-tested) ────────────────────────────────────────────

/**
 * Department and Job both constrain which job an application belongs to, so they
 * AND together: the effective job set is the intersection when both are given,
 * or whichever one is given. Returns null when neither constrains jobs.
 */
export function effectiveJobIds(deptJobIds: string[] | null, selectedJobIds: string[] | null): string[] | null {
  if (deptJobIds && selectedJobIds) {
    const sel = new Set(selectedJobIds)
    return deptJobIds.filter(id => sel.has(id))
  }
  return deptJobIds ?? selectedJobIds ?? null
}

/**
 * Combine the candidate sets from the two filter groups (application-level and
 * tags) with AND, then remove the exclusion set. `null` means "this group didn't
 * filter". Returns [] when neither group filtered (caller must require ≥1 filter).
 */
export function combineFilterSets(params: {
  applicationSet: Set<string> | null
  tagSet: Set<string> | null
  excludeSet: Set<string>
}): string[] {
  const { applicationSet, tagSet, excludeSet } = params
  let base: Set<string> | null
  if (applicationSet && tagSet) {
    base = new Set(Array.from(applicationSet).filter(id => tagSet.has(id)))
  } else {
    base = applicationSet ?? tagSet ?? null
  }
  if (!base) return []
  return Array.from(base).filter(id => !excludeSet.has(id))
}

// ── Resolver (queries the canonical model) ────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DB = SupabaseClient<any>

const ROW_CAP = 5000

/**
 * Resolve a filter into a deduped list of candidate ids on the canonical model.
 * AND across filter categories; OR within a category (multi-select). Requires at
 * least one active filter — returns [] otherwise (never "everyone").
 */
export async function resolveFilteredCandidateIds(db: DB, orgId: string, f: CandidateFilter): Promise<string[]> {
  const hasApp = !!(f.department_ids?.length || f.job_ids?.length || f.stage_names?.length || f.statuses?.length)
  const hasTags = !!f.tags?.length
  if (!hasApp && !hasTags) return []

  // Department → its jobs (canonical: jobs.department_id).
  let deptJobIds: string[] | null = null
  if (f.department_ids?.length) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (db as any).from('jobs')
      .select('id').eq('org_id', orgId).in('department_id', f.department_ids).limit(ROW_CAP)
    deptJobIds = (data ?? []).map((r: { id: string }) => r.id)
  }
  const jobIds = effectiveJobIds(deptJobIds, f.job_ids?.length ? f.job_ids : null)

  // Stage names → stage ids (canonical stages carry org_id + name).
  let stageIds: string[] | null = null
  if (f.stage_names?.length) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (db as any).from('pipeline_stages')
      .select('id').eq('org_id', orgId).in('name', f.stage_names).limit(ROW_CAP)
    stageIds = (data ?? []).map((r: { id: string }) => r.id)
  }

  // Application-level candidate set.
  let applicationSet: Set<string> | null = null
  if (hasApp) {
    const jobConstraintEmpty = jobIds !== null && jobIds.length === 0
    const stageConstraintEmpty = stageIds !== null && stageIds.length === 0
    if (jobConstraintEmpty || stageConstraintEmpty) {
      applicationSet = new Set() // a constraint resolved to zero → nothing matches
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let q = (db as any).from('applications').select('candidate_id').eq('org_id', orgId)
      if (jobIds !== null) q = q.in('job_id', jobIds)
      if (stageIds !== null) q = q.in('stage_id', stageIds)
      if (f.statuses?.length) q = q.in('status', f.statuses)
      const { data } = await q.limit(ROW_CAP)
      applicationSet = new Set((data ?? []).map((r: { candidate_id: string }) => r.candidate_id))
    }
  }

  // Tag-level candidate set.
  let tagSet: Set<string> | null = null
  if (hasTags) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (db as any).from('candidate_tags')
      .select('candidate_id').eq('org_id', orgId).in('tag', f.tags).limit(ROW_CAP)
    tagSet = new Set((data ?? []).map((r: { candidate_id: string }) => r.candidate_id))
  }

  // Exclusions (do-not-contact) unless explicitly disabled.
  const excludeSet = new Set<string>()
  if (f.exclude_do_not_contact !== false) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (db as any).from('candidate_tags')
      .select('candidate_id').eq('org_id', orgId).in('tag', COLD_OUTREACH_EXCLUDE_TAGS).limit(ROW_CAP)
    for (const r of (data ?? [])) excludeSet.add(r.candidate_id)
  }

  return combineFilterSets({ applicationSet, tagSet, excludeSet })
}
