/**
 * Crustdata HTTP client — the "Acquire" stage for vendor:crustdata (Slice 2).
 * See docs/pool-vendor-ingestion-architecture.md §2 stage 1.
 *
 * One job: turn a Crustdata filter query into raw person payloads + the credit cost
 * of getting them. It knows nothing about the pool, the ledger, or profiles — the
 * orchestrator (domain/crustdata-acquire.ts) wires this to the ingest spine. Keeping
 * the network here and the DB there is what lets the client be unit-tested by
 * mocking `fetch` alone.
 *
 * Auth + versioning verified against a live call on 2026-09-16:
 *   POST https://api.crustdata.com/person/search
 *   headers: authorization: Bearer <key>, x-api-version: 2025-11-01
 *   body: { filters, limit, cursor?, sorts? }
 *   response: { profiles[], next_cursor, total_count, ... }; header x-credits-used.
 */
import { logger } from '@/lib/logger'

const BASE_URL = 'https://api.crustdata.com'
const API_VERSION = '2025-11-01'

/** Crustdata's hard ceiling on records per page. */
export const CRUSTDATA_MAX_PAGE = 1000
/**
 * Default page size. Deliberately 1: during development we fetch a single person per
 * call so a mistake can never burn more than a fraction of a credit. Callers that
 * genuinely want more must ask for it explicitly.
 */
export const CRUSTDATA_DEFAULT_LIMIT = 1

/** A Crustdata filter group. Kept loose here; the ICP→query translator (Slice 3) builds it. */
export type CrustdataFilters = Record<string, unknown>

export interface CrustdataSearchOptions {
  /** Records to return this page. Clamped to [1, CRUSTDATA_MAX_PAGE]. Default 1. */
  limit?: number
  /** Pagination cursor from a previous response's next_cursor. */
  cursor?: string | null
  /** Sort spec, e.g. [{ field: 'professional_network.connections', order: 'desc' }]. */
  sorts?: unknown[]
  /** Abort the request (timeouts, cancellation). */
  signal?: AbortSignal
}

export interface CrustdataSearchResult {
  /** Raw profile objects, exactly as the vendor returned them (hand straight to the adapter). */
  profiles: unknown[]
  nextCursor: string | null
  /** Total matches for the query across all pages, when the vendor reports it. */
  totalCount: number | null
  /** Credits this call cost, read from the x-credits-used header (fractional, e.g. 0.3). */
  creditsUsed: number
  /** Remaining requests in the current rate-limit window, when reported. */
  rateLimitRemaining: number | null
}

/** The API key is missing — the source cannot run. Distinct so callers can degrade gracefully. */
export class CrustdataConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CrustdataConfigError'
  }
}

/** A non-2xx response. `status` lets callers distinguish 429 (rate limit) / 401 (auth) / 5xx. */
export class CrustdataApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body?: string,
  ) {
    super(message)
    this.name = 'CrustdataApiError'
  }
}

/** True when CRUSTDATA_API_KEY is set. Lets callers skip the source instead of throwing. */
export function crustdataConfigured(): boolean {
  return Boolean(process.env.CRUSTDATA_API_KEY)
}

function clampLimit(n: number | undefined): number {
  const v = Math.floor(n ?? CRUSTDATA_DEFAULT_LIMIT)
  if (!Number.isFinite(v) || v < 1) return CRUSTDATA_DEFAULT_LIMIT
  return Math.min(v, CRUSTDATA_MAX_PAGE)
}

/**
 * One page of Crustdata person search. PURE of the pool — no DB, no ledger. Reads the
 * key lazily from the environment so importing this module never requires it (mirrors
 * lib/email/send.ts). Throws CrustdataConfigError when unconfigured and
 * CrustdataApiError on a non-2xx response; the caller decides what to record.
 */
export async function searchPeople(
  filters: CrustdataFilters,
  opts: CrustdataSearchOptions = {},
): Promise<CrustdataSearchResult> {
  const key = process.env.CRUSTDATA_API_KEY
  if (!key) throw new CrustdataConfigError('CRUSTDATA_API_KEY is not set — the Crustdata source is unavailable')

  const limit = clampLimit(opts.limit)
  const body: Record<string, unknown> = { filters, limit }
  if (opts.cursor) body.cursor = opts.cursor
  if (opts.sorts?.length) body.sorts = opts.sorts

  const res = await fetch(`${BASE_URL}/person/search`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${key}`,
      'content-type': 'application/json',
      'x-api-version': API_VERSION,
    },
    body: JSON.stringify(body),
    signal: opts.signal,
  })

  // Read the meter regardless of status — a rejected call can still be billed.
  const creditsUsed = Number(res.headers.get('x-credits-used') ?? '') || 0
  const remainingRaw = res.headers.get('x-ratelimit-remaining')
  const rateLimitRemaining = remainingRaw != null && remainingRaw !== '' ? Number(remainingRaw) : null

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    logger.warn('Crustdata search failed', { status: res.status, creditsUsed, body: text.slice(0, 500) })
    throw new CrustdataApiError(`Crustdata /person/search returned ${res.status}`, res.status, text)
  }

  const data = (await res.json()) as {
    profiles?: unknown[]
    next_cursor?: string | null
    total_count?: number | null
  }

  return {
    profiles: Array.isArray(data.profiles) ? data.profiles : [],
    nextCursor: data.next_cursor ?? null,
    totalCount: typeof data.total_count === 'number' ? data.total_count : null,
    creditsUsed,
    rateLimitRemaining,
  }
}
