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
import {
  buildSearchPlan,
  isPlanRunnable,
  describePlan,
  type SearchPlan,
  type SearchPlanContext,
} from '@/modules/pool/vendors/crustdata/search-plan'
import type { Icp } from '@/lib/types/icp'

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

/** What one lane of the plan did this run. */
export interface LaneRunResult {
  key: string
  kind: string
  label: string
  summary: string[]
  rationale: string | null
  /** Vendor's total matches for the lane (may be null when not reported). */
  total: number | null
  /** Profiles this lane contributed AFTER cross-lane de-duplication. */
  fetched: number
  /** Profiles the lane returned that another lane had already returned. */
  duplicates: number
  creditsUsed: number
  /** Where the next run should continue from (null = exhausted / start over). */
  nextCursor: string | null
  /** True when this run resumed from a cursor saved by an earlier run. */
  resumed: boolean
  error?: string | null
}

export interface SourceFromIcpResult extends SourceFromCrustdataResult {
  /** The plan that ran, lane by lane, with what each contributed. */
  plan: ReturnType<typeof describePlan> & { results: LaneRunResult[] }
  /** Pool profile ids this run created or refreshed (for "new this run" badges). */
  profileIds: string[]
}

type LaneCursorMap = Map<string, string>

/**
 * Cursor continuity ("retrieval continuity" in the audit): find, per lane key, the
 * cursor the most recent run for this job left off at, so a re-run continues to page
 * 2 instead of re-buying page 1. Read from the last few pool_ingest_runs rows — no
 * new table needed. Best-effort: any failure means "start from page 1".
 */
async function loadLaneCursors(supabase: Supabase, jobId: string | null | undefined): Promise<LaneCursorMap> {
  const out: LaneCursorMap = new Map()
  if (!jobId) return out
  try {
    const { data } = await (supabase as unknown as LooseSb)
      .from('pool_ingest_runs')
      .select('query')
      .eq('source_key', SOURCE)
      .eq('job_id', jobId)
      .order('started_at', { ascending: false })
      .limit(10)
    for (const row of (data ?? []) as { query?: { results?: LaneRunResult[] } | null }[]) {
      for (const r of row.query?.results ?? []) {
        if (r?.key && r.nextCursor && !out.has(r.key)) out.set(r.key, r.nextCursor)
      }
    }
  } catch {
    /* start from page 1 */
  }
  return out
}

/** The vendor's identity for a raw profile, for cross-lane de-duplication. */
function profileIdentity(raw: unknown): string | null {
  const p = raw as { social_handles?: { professional_network_identifier?: { profile_url?: string | null } | null } | null; basic_profile?: { current_title?: string | null; location?: { raw?: string | null } | null } | null }
  const url = p?.social_handles?.professional_network_identifier?.profile_url?.trim().toLowerCase()
  return url || null
}

/**
 * Source candidates for a role from its ICP (Step 2: multi-lane search plan).
 *
 * Builds the plan (feeder lanes from the recruiter brief, a title-families lane,
 * shared market/years/structured-gate conditions), then runs the lanes IN PRIORITY
 * ORDER under one ingest run and one total budget (`maxRecords`): each lane gets an
 * equal share, and whatever a thin lane leaves unspent rolls into the next. Profiles
 * are de-duplicated across lanes by LinkedIn URL before ingest so one person is never
 * bought twice in a run; per-lane cursors are saved on the run so the NEXT run resumes
 * where each lane left off. A lane that errors is recorded and skipped, never fatal.
 */
export async function sourceFromIcp(
  supabase: Supabase,
  icp: Pick<Icp, 'must_haves'> & Partial<Pick<Icp, 'sourcing_map' | 'job_id'>>,
  ctx: CrustdataQueryContext & Pick<SearchPlanContext, 'roleContext' | 'maxFeederLanes'> = {},
  opts: Omit<SourceFromCrustdataInput, 'filters'> = {},
): Promise<SourceFromIcpResult> {
  const plan = buildSearchPlan(icp, { title: ctx.title, roleContext: ctx.roleContext, locationRadiusKm: ctx.locationRadiusKm, maxFeederLanes: ctx.maxFeederLanes })
  if (!isPlanRunnable(plan)) throw new EmptyIcpQueryError(plan)

  if (!crustdataConfigured()) {
    throw new CrustdataConfigError('CRUSTDATA_API_KEY is not set — cannot source from Crustdata')
  }
  if (!opts.allowDisabled && !(await isSourceEnabled(supabase))) {
    throw new Error(`${SOURCE} is disabled in pool_sources. Enable it, or pass allowDisabled:true for a development run.`)
  }

  const jobId = opts.jobId ?? icp.job_id ?? null
  const maxRecords = Math.max(1, opts.maxRecords ?? opts.perPage ?? CRUSTDATA_DEFAULT_LIMIT)
  const described = describePlan(plan)
  const cursors = await loadLaneCursors(supabase, jobId)

  const runId = await startIngestRun(supabase, {
    sourceKey: SOURCE,
    orgId: opts.orgId,
    jobId,
    query: { ...described, maxRecords, results: [] },
  })

  const profiles: unknown[] = []
  const seen = new Set<string>()
  const results: LaneRunResult[] = []
  let creditsUsed = 0
  let matchedTotal = 0

  try {
    let remaining = maxRecords
    for (let i = 0; i < plan.lanes.length && remaining > 0; i++) {
      const lane = plan.lanes[i]
      const lanesLeft = plan.lanes.length - i
      const budget = Math.max(1, Math.ceil(remaining / lanesLeft))
      const cursor = cursors.get(lane.key) ?? null
      const result: LaneRunResult = {
        key: lane.key, kind: lane.kind, label: lane.label, summary: lane.summary, rationale: lane.rationale ?? null,
        total: null, fetched: 0, duplicates: 0, creditsUsed: 0, nextCursor: null, resumed: Boolean(cursor),
      }
      try {
        const page = await searchPeople(lane.filters, { limit: budget, cursor, sorts: opts.sorts })
        creditsUsed += page.creditsUsed
        result.creditsUsed = page.creditsUsed
        result.total = page.totalCount
        result.nextCursor = page.nextCursor
        if (page.totalCount) matchedTotal += page.totalCount
        await recordVendorCall(supabase, {
          sourceKey: SOURCE, endpoint: 'search', orgId: opts.orgId, runId, ok: true,
          credits: Math.ceil(page.creditsUsed), recordsReturned: page.profiles.length,
        })
        for (const raw of page.profiles) {
          const id = profileIdentity(raw)
          if (id && seen.has(id)) { result.duplicates++; continue }
          if (id) seen.add(id)
          profiles.push(raw)
          result.fetched++
        }
        remaining -= result.fetched
      } catch (err) {
        result.error = err instanceof Error ? err.message : String(err)
        await recordVendorCall(supabase, {
          sourceKey: SOURCE, endpoint: 'search', orgId: opts.orgId, runId, ok: false, credits: 0, recordsReturned: 0,
        }).catch(() => undefined)
        logger.warn('Crustdata lane failed', { runId, lane: lane.label, error: result.error })
      }
      results.push(result)
    }

    const ingest = await ingestVendorRecords(supabase, SOURCE, profiles, {
      runId,
      creditsPerRecord: profiles.length ? creditsUsed / profiles.length : 0,
    })
    await finishIngestRun(supabase, runId, {
      ids_matched: matchedTotal || profiles.length,
      ids_bought: profiles.length,
      profiles_created: ingest.created,
      profiles_merged: ingest.merged,
      records_unusable: ingest.unusable,
      credits_used: Math.ceil(creditsUsed),
    })
    // Persist per-lane outcomes + cursors on the run (jsonb) so the next run resumes.
    await (supabase as unknown as LooseSb)
      .from('pool_ingest_runs')
      .update({ query: { ...described, maxRecords, results } })
      .eq('id', runId)
      .then(() => undefined, () => undefined)

    logger.info('Crustdata plan run complete', {
      runId, lanes: results.length, matched: matchedTotal, fetched: profiles.length, creditsUsed,
      created: ingest.created, merged: ingest.merged, unusable: ingest.unusable,
    })
    return {
      runId,
      matched: matchedTotal || null,
      fetched: profiles.length,
      creditsUsed,
      ingest,
      plan: { ...described, results },
      profileIds: ingest.needsReembed,
    }
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err)
    await finishIngestRun(supabase, runId, { credits_used: Math.ceil(creditsUsed), error: reason }).catch(() => undefined)
    throw err
  }
}
