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
import {
  buildCrustdataQueryFromIcp,
  isQueryable,
  type CrustdataQueryContext,
  type CrustdataQueryBuild,
} from '@/modules/pool/vendors/crustdata/query'
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

/** Thrown when an ICP produces no usable Crustdata filters, so a search would be wasteful. */
export class EmptyIcpQueryError extends Error {
  constructor(readonly build: CrustdataQueryBuild) {
    super('ICP produced no Crustdata-searchable filters; nothing to source on')
    this.name = 'EmptyIcpQueryError'
  }
}

export interface SourceFromIcpResult extends SourceFromCrustdataResult {
  /** How the ICP translated — which requirements became filters and which were skipped. */
  query: CrustdataQueryBuild
}

/**
 * Source candidates for a role directly from its ICP (Slice 3). Translates the ICP's
 * must-haves (+ job title) into a Crustdata query, then runs it through
 * sourceFromCrustdata. Throws EmptyIcpQueryError if the ICP yields no filters, so we
 * never spend a search on an empty query.
 */
export async function sourceFromIcp(
  supabase: Supabase,
  icp: Pick<Icp, 'must_haves'> & Partial<Pick<Icp, 'sourcing_map' | 'job_id'>>,
  ctx: CrustdataQueryContext = {},
  opts: Omit<SourceFromCrustdataInput, 'filters'> = {},
): Promise<SourceFromIcpResult> {
  const query = buildCrustdataQueryFromIcp(icp, ctx)
  if (!isQueryable(query)) throw new EmptyIcpQueryError(query)

  const result = await sourceFromCrustdata(supabase, {
    ...opts,
    filters: query.filters,
    jobId: opts.jobId ?? icp.job_id ?? null,
  })
  return { ...result, query }
}
