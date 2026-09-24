/**
 * Crustdata source orchestrator — ties the Acquire stage to the ingest spine (Slice 2).
 *
 *   startIngestRun → searchPeople (client) → recordVendorCall → ingestVendorRecords
 *     → finishIngestRun
 *
 * This is the only Crustdata-specific piece of the domain layer; everything below
 * ingestVendorRecords is vendor-agnostic.
 *
 * ┌───────────────────────────────────────────────────────────────────────────────┐
 * │ DELIBERATELY OMITTED IN THIS SLICE: "never buy twice" (the pre-buy ledger).      │
 * │                                                                                  │
 * │ The full design (vendor-ledger.ts) is: planBuy() subtracts ids we already hold   │
 * │ from what the search matched, then claimVendorIds() locks the rest so two         │
 * │ concurrent searches can't both pay for one person. We are NOT calling either      │
 * │ here yet — every matched profile is fetched and ingested unconditionally.         │
 * │                                                                                  │
 * │ Consequences while this is off:                                                  │
 * │   • Re-running the same search RE-FETCHES (and re-pays for) the same people.      │
 * │     Ingestion itself stays correct — resolveProfile() dedupes by identity, so     │
 * │     the pool won't grow duplicate humans — but the credits are spent again.       │
 * │   • pool_vendor_records stays empty: settleVendorRecord() UPDATEs a row keyed on  │
 * │     (source_key, external_id), and with no prior claim row that UPDATE matches     │
 * │     nothing and is a harmless no-op. So per-record ownership is not tracked yet.   │
 * │                                                                                  │
 * │ Spend IS still visible: every call is logged to pool_vendor_calls via             │
 * │ recordVendorCall(), and per-run totals land in pool_ingest_runs.                  │
 * │                                                                                  │
 * │ TO ENABLE LATER (its own slice): before fetching, call                            │
 * │   const plan = await planBuy(sb, SOURCE, matchedIds, { ttlDays })                 │
 * │   const toBuy = await claimVendorIds(sb, SOURCE, plan.unseen.concat(refresh ?     │
 * │                    plan.stale : []), { refresh })                                 │
 * │ then fetch/ingest only `toBuy`, and run releaseStaleClaims() from the queue        │
 * │ worker. Crustdata bills per search request (no free id-only tier), so the ids     │
 * │ must come from a first cheap page before the pre-buy check can help.              │
 * └───────────────────────────────────────────────────────────────────────────────┘
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'
import { logger } from '@/lib/logger'
import {
  searchPeople,
  crustdataConfigured,
  CrustdataConfigError,
  CRUSTDATA_DEFAULT_LIMIT,
  type CrustdataFilters,
} from '@/modules/pool/vendors/crustdata/client'
import { ingestVendorRecords, type BatchIngestTotals } from '@/modules/pool/domain/ingest'
import { startIngestRun, finishIngestRun, recordVendorCall } from '@/modules/pool/domain/vendor-ledger'
import type { CrustdataQueryContext } from '@/modules/pool/vendors/crustdata/query'
import { isPlanRunnable, describePlan, type SearchPlan, type SearchPlanContext } from '@/modules/pool/vendors/crustdata/search-plan'
import { compileSpec } from '@/modules/pool/vendors/crustdata/compile-spec'
import { resolveSearchSpec } from '@/modules/pool/search/spec-from-brief'
import type { Icp } from '@/lib/types/icp'
import type { SearchSpec } from '@/lib/types/search-spec'

type Supabase = SupabaseClient<Database>
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LooseSb = any

const SOURCE = 'vendor:crustdata'

export interface SourceFromCrustdataInput {
  /** The Crustdata filter query. Built by hand for now; by the ICP translator in Slice 3. */
  filters: CrustdataFilters
  /** Records per page. Default 1 (credit safety). Clamped by the client. */
  perPage?: number
  /**
   * Hard cap on total records fetched across all pages. Defaults to perPage (a single
   * page), so nothing paginates unless a caller explicitly opts in. This is the main
   * guardrail against runaway spend.
   */
  maxRecords?: number
  sorts?: unknown[]
  orgId?: string | null
  jobId?: string | null
  /**
   * vendor:crustdata is seeded enabled=false until the product wires it in. Set true to
   * run it during development/testing while it's still disabled.
   */
  allowDisabled?: boolean
}

export interface SourceFromCrustdataResult {
  runId: string
  /** Total matches the vendor reports for the query (may exceed what we fetched). */
  matched: number | null
  /** Profiles actually pulled this run. */
  fetched: number
  /** Fractional credits spent this run (sum of x-credits-used across pages). */
  creditsUsed: number
  ingest: BatchIngestTotals
}

async function isSourceEnabled(supabase: Supabase): Promise<boolean> {
  const { data } = await (supabase as unknown as LooseSb)
    .from('pool_sources')
    .select('enabled')
    .eq('key', SOURCE)
    .maybeSingle()
  return Boolean(data?.enabled)
}

/**
 * Run one Crustdata search and ingest the results into the pool. Returns per-run
 * totals. Throws CrustdataConfigError if the key is missing and an Error if the
 * source is disabled without allowDisabled.
 */
export async function sourceFromCrustdata(
  supabase: Supabase,
  input: SourceFromCrustdataInput,
): Promise<SourceFromCrustdataResult> {
  if (!crustdataConfigured()) {
    throw new CrustdataConfigError('CRUSTDATA_API_KEY is not set — cannot source from Crustdata')
  }
  if (!input.allowDisabled && !(await isSourceEnabled(supabase))) {
    throw new Error(
      `${SOURCE} is disabled in pool_sources. Enable it, or pass allowDisabled:true for a development run.`,
    )
  }

  const perPage = input.perPage ?? CRUSTDATA_DEFAULT_LIMIT
  const maxRecords = Math.max(1, input.maxRecords ?? perPage)

  const runId = await startIngestRun(supabase, {
    sourceKey: SOURCE,
    orgId: input.orgId,
    jobId: input.jobId,
    query: { filters: input.filters, perPage, maxRecords },
  })

  const profiles: unknown[] = []
  let creditsUsed = 0
  let matched: number | null = null
  let cursor: string | null = null

  try {
    // Page until we hit maxRecords, run out of results, or run out of cursor. With the
    // default maxRecords === perPage this loop runs exactly once.
    while (profiles.length < maxRecords) {
      const pageLimit = Math.min(perPage, maxRecords - profiles.length)
      const page = await searchPeople(input.filters, { limit: pageLimit, cursor, sorts: input.sorts })

      creditsUsed += page.creditsUsed
      matched = page.totalCount
      // credits is an int column; ceil so fractional spend is never under-reported.
      await recordVendorCall(supabase, {
        sourceKey: SOURCE,
        endpoint: 'search',
        orgId: input.orgId,
        runId,
        ok: true,
        credits: Math.ceil(page.creditsUsed),
        recordsReturned: page.profiles.length,
      })

      profiles.push(...page.profiles)
      cursor = page.nextCursor
      if (!cursor || page.profiles.length === 0) break
    }

    const ingest = await ingestVendorRecords(supabase, SOURCE, profiles, {
      runId,
      creditsPerRecord: profiles.length ? creditsUsed / profiles.length : 0,
    })

    await finishIngestRun(supabase, runId, {
      ids_matched: matched ?? profiles.length,
      ids_bought: profiles.length,
      profiles_created: ingest.created,
      profiles_merged: ingest.merged,
      records_unusable: ingest.unusable,
      credits_used: Math.ceil(creditsUsed),
    })

    logger.info('Crustdata source run complete', {
      runId,
      matched,
      fetched: profiles.length,
      creditsUsed,
      created: ingest.created,
      merged: ingest.merged,
      unusable: ingest.unusable,
    })

    return { runId, matched, fetched: profiles.length, creditsUsed, ingest }
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err)
    await finishIngestRun(supabase, runId, { credits_used: Math.ceil(creditsUsed), error: reason }).catch(
      () => undefined,
    )
    throw err
  }
}

/** Thrown when an ICP produces no usable Crustdata search lanes, so a search would be wasteful. */
export class EmptyIcpQueryError extends Error {
  constructor(readonly plan: SearchPlan) {
    super('ICP produced no Crustdata search lanes; nothing to source on')
    this.name = 'EmptyIcpQueryError'
  }
}

/** What one level (lane) of the ladder did this run. */
export interface LaneRunResult {
  key: string
  kind: string
  label: string
  summary: string[]
  rationale: string | null
  /** Vendor's total matches for the level (may be null when not reported). */
  total: number | null
  /** Profiles this level contributed AFTER cross-level de-duplication. */
  fetched: number
  /** Profiles the level returned that an earlier level had already returned. */
  duplicates: number
  creditsUsed: number
  /** Where the next run continues from (null = nothing more on this page chain). */
  nextCursor: string | null
  /** True when this run resumed from a cursor saved by an earlier run. */
  resumed: boolean
  /** True once the level has no more unseen people — later runs skip it and relax to the next. */
  exhausted: boolean
  /** Pool profile ids this level acquired this run (for match-level labels). */
  profileIds: string[]
  /** The level's own must-have ids the query applied (with the run's baseCriterionIds, what its people are vendor-verified on). */
  criterionIds?: string[]
  error?: string | null
}

/** Which level acquired a profile — the "match level" shown on every person. */
export interface AcquiredLevel {
  level: number
  label: string
  key: string
  /** Must-have ids the vendor query applied when this person was bought (empty for runs that predate the record). */
  vendorGateIds?: string[]
}
export type AcquiredMap = Record<string, AcquiredLevel>

export interface SourceFromIcpResult extends SourceFromCrustdataResult {
  /** The plan that ran, level by level, with what each contributed. */
  plan: ReturnType<typeof describePlan> & { results: LaneRunResult[]; specSource: SearchSpec['source'] }
  /** Pool profile ids this run created or refreshed (for "new this run" badges). */
  profileIds: string[]
  /** profile id → the level that acquired it, this run. */
  acquired: AcquiredMap
}

interface LaneState { cursor: string | null; exhausted: boolean }

/**
 * Retrieval continuity: per level key, where the most recent runs for this job left
 * off (cursor) and whether the level is already drained. Read from the last few
 * pool_ingest_runs rows — no new table. Best-effort: any failure = start from page 1.
 */
async function loadLaneStates(supabase: Supabase, jobId: string | null | undefined, cursorScope: string | null = null): Promise<Map<string, LaneState>> {
  const out = new Map<string, LaneState>()
  if (!jobId) return out
  try {
    const { data } = await (supabase as unknown as LooseSb)
      .from('pool_ingest_runs').select('query').eq('source_key', SOURCE).eq('job_id', jobId)
      .order('started_at', { ascending: false }).limit(12)
    for (const row of (data ?? []) as { query?: { cursorScope?: string | null; results?: Partial<LaneRunResult>[] } | null }[]) {
      // An A/B experiment must never advance the live job cursor, or the other arm's
      // cursor. Legacy/live runs have no scope and continue to share the null scope.
      if ((row.query?.cursorScope ?? null) !== cursorScope) continue
      for (const r of row.query?.results ?? []) {
        if (!r?.key || out.has(r.key)) continue
        if (r.error) continue // a failed attempt says nothing about the level's supply
        out.set(r.key, { cursor: r.nextCursor ?? null, exhausted: Boolean(r.exhausted) })
      }
    }
  } catch { /* start from page 1 */ }
  return out
}

/**
 * Which level acquired each profile for this job, across recent runs (lowest level
 * wins if a person was reached twice). Used to label matches on every re-rank.
 */
export async function loadAcquiredLevels(supabase: Supabase, jobId: string): Promise<AcquiredMap> {
  const out: AcquiredMap = {}
  try {
    const { data } = await (supabase as unknown as LooseSb)
      .from('pool_ingest_runs').select('query').eq('source_key', SOURCE).eq('job_id', jobId)
      .order('started_at', { ascending: false }).limit(30)
    for (const row of (data ?? []) as { query?: { cursorScope?: string | null; results?: Partial<LaneRunResult>[]; baseCriterionIds?: string[] } | null }[]) {
      // Sourcing Lab acquisitions remain visible in the shared pool, but their
      // experimental level must not be presented as the live ICP's level.
      if (row.query?.cursorScope) continue
      const results = row.query?.results ?? []
      // The must-have ids the vendor query applied on THIS run — they hold for the people
      // it bought by construction. Older runs recorded none; those people are checked from data.
      const baseIds = row.query?.baseCriterionIds ?? []
      results.forEach((r, i) => {
        const level = i + 1
        const vendorGateIds = [...baseIds, ...(r?.criterionIds ?? [])]
        for (const id of r?.profileIds ?? []) {
          if (!out[id] || out[id].level > level) out[id] = { level, label: r.label ?? `Level ${level}`, key: r.key ?? '', vendorGateIds }
        }
      })
    }
  } catch { /* no labels */ }
  return out
}

/** The vendor's identity for a raw profile, for cross-level de-duplication. */
function profileIdentity(raw: unknown): string | null {
  const p = raw as { social_handles?: { professional_network_identifier?: { profile_url?: string | null } | null } | null }
  const url = p?.social_handles?.professional_network_identifier?.profile_url?.trim().toLowerCase()
  return url || null
}

/**
 * Acquire candidates for a job from its SEARCH SPEC (the recruiter's ladder).
 *
 * The spec is the recruiter-edited one stored on the ICP, or derived from the brief.
 * It compiles to one lane per level; lanes run IN ORDER and each is EXHAUSTED before
 * the next opens: a run asks level 1 for the whole remaining budget, moves to level 2
 * only when level 1 returns short with no further page, and remembers per level both
 * the cursor and the exhausted flag so the next click continues where this one
 * stopped. People are de-duplicated across levels before purchase; every acquired
 * profile is labelled with the level that reached it. A level that errors is
 * recorded and skipped, never fatal.
 */
export async function sourceFromIcp(
  supabase: Supabase,
  icp: Pick<Icp, 'must_haves'> & Partial<Pick<Icp, 'sourcing_map' | 'job_id' | 'competencies'>>,
  ctx: CrustdataQueryContext & Pick<SearchPlanContext, 'roleContext' | 'maxFeederLanes'> = {},
  opts: Omit<SourceFromCrustdataInput, 'filters'> & { cursorScope?: string | null; maxPerLane?: number | null } = {},
): Promise<SourceFromIcpResult> {
  const { spec } = resolveSearchSpec(icp, { title: ctx.title, roleContext: ctx.roleContext, locationRadiusKm: ctx.locationRadiusKm })
  const plan = compileSpec(spec)
  if (!isPlanRunnable(plan)) throw new EmptyIcpQueryError(plan)

  if (!crustdataConfigured()) throw new CrustdataConfigError('CRUSTDATA_API_KEY is not set — cannot source from Crustdata')
  if (!opts.allowDisabled && !(await isSourceEnabled(supabase))) {
    throw new Error(`${SOURCE} is disabled in pool_sources. Enable it, or pass allowDisabled:true for a development run.`)
  }

  const jobId = opts.jobId ?? icp.job_id ?? null
  const maxRecords = Math.max(1, opts.maxRecords ?? opts.perPage ?? CRUSTDATA_DEFAULT_LIMIT)
  const described = describePlan(plan)
  const cursorScope = opts.cursorScope ?? null
  const states = await loadLaneStates(supabase, jobId, cursorScope)

  const runId = await startIngestRun(supabase, {
    sourceKey: SOURCE, orgId: opts.orgId, jobId,
    query: { ...described, specSource: spec.source, maxRecords, cursorScope, results: [], baseCriterionIds: plan.baseCriterionIds },
  })

  const profiles: unknown[] = []
  const laneOfPayload: number[] = [] // payload index → lane index
  const seen = new Set<string>()
  const results: LaneRunResult[] = []
  let creditsUsed = 0
  let matchedTotal = 0

  try {
    let remaining = maxRecords
    for (let i = 0; i < plan.lanes.length; i++) {
      const lane = plan.lanes[i]
      const prior = states.get(lane.key) ?? { cursor: null, exhausted: false }
      const result: LaneRunResult = {
        key: lane.key, kind: lane.kind, label: lane.label, summary: lane.summary, rationale: lane.rationale ?? null,
        total: null, fetched: 0, duplicates: 0, creditsUsed: 0, nextCursor: prior.cursor, resumed: Boolean(prior.cursor),
        exhausted: prior.exhausted, profileIds: [], criterionIds: lane.criterionIds ?? [],
      }
      results.push(result)
      if (remaining <= 0 || prior.exhausted) continue // already drained — relax to the next level
      try {
        const laneLimit = Math.min(remaining, Math.max(1, opts.maxPerLane ?? remaining))
        const page = await searchPeople(lane.filters, { limit: laneLimit, cursor: prior.cursor, sorts: opts.sorts })
        creditsUsed += page.creditsUsed
        result.creditsUsed = page.creditsUsed
        result.total = page.totalCount
        result.nextCursor = page.nextCursor
        if (page.totalCount) matchedTotal += page.totalCount
        await recordVendorCall(supabase, { sourceKey: SOURCE, endpoint: 'search', orgId: opts.orgId, runId, ok: true, credits: Math.ceil(page.creditsUsed), recordsReturned: page.profiles.length })
        for (const raw of page.profiles) {
          const id = profileIdentity(raw)
          if (id && seen.has(id)) { result.duplicates++; continue }
          if (id) seen.add(id)
          profiles.push(raw)
          laneOfPayload.push(i)
          result.fetched++
        }
        remaining -= result.fetched
        // Short page with no next cursor = the level has nothing more to give.
        if (!page.nextCursor && page.profiles.length < Math.min(remaining + result.fetched, maxRecords)) result.exhausted = true
      } catch (err) {
        result.error = err instanceof Error ? err.message : String(err)
        await recordVendorCall(supabase, { sourceKey: SOURCE, endpoint: 'search', orgId: opts.orgId, runId, ok: false, credits: 0, recordsReturned: 0 }).catch(() => undefined)
        logger.warn('Crustdata level failed', { runId, level: lane.label, error: result.error })
      }
    }

    const ingest = await ingestVendorRecords(supabase, SOURCE, profiles, { runId, creditsPerRecord: profiles.length ? creditsUsed / profiles.length : 0 })
    const acquired: AcquiredMap = {}
    ingest.outcomes.forEach((o, idx) => {
      if (o.status !== 'ingested') return
      const li = laneOfPayload[idx]
      results[li].profileIds.push(o.profileId)
      acquired[o.profileId] = {
        level: li + 1,
        label: results[li].label,
        key: results[li].key,
        vendorGateIds: [...plan.baseCriterionIds, ...(results[li].criterionIds ?? [])],
      }
    })

    await finishIngestRun(supabase, runId, {
      ids_matched: matchedTotal || profiles.length, ids_bought: profiles.length,
      profiles_created: ingest.created, profiles_merged: ingest.merged, records_unusable: ingest.unusable, credits_used: Math.ceil(creditsUsed),
    })
    await (supabase as unknown as LooseSb).from('pool_ingest_runs').update({ query: { ...described, specSource: spec.source, maxRecords, cursorScope, results, baseCriterionIds: plan.baseCriterionIds } }).eq('id', runId).then(() => undefined, () => undefined)

    logger.info('Crustdata ladder run complete', { runId, levels: results.length, matched: matchedTotal, fetched: profiles.length, creditsUsed, created: ingest.created, merged: ingest.merged })
    return {
      runId, matched: matchedTotal || null, fetched: profiles.length, creditsUsed, ingest,
      plan: { ...described, results, specSource: spec.source },
      profileIds: ingest.needsReembed,
      acquired,
    }
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err)
    await finishIngestRun(supabase, runId, { credits_used: Math.ceil(creditsUsed), error: reason }).catch(() => undefined)
    throw err
  }
}
