/**
 * The payment ledger (S1). See docs/pool-vendor-ingestion-architecture.md §1b–1c.
 *
 * "Never pay for the same record twice" lives here. Three jobs, one table
 * (`pool_vendor_records`, migration 122), all keyed on (source_key, external_id):
 *
 *   1. THE PRE-BUY CHECK — subtract what we've already paid for from what the free
 *      vendor search returned. Deliberately NOT `pool_identities`: that table's
 *      profile_id is NOT NULL, so it cannot record a CHARGED fetch that resolved to
 *      nothing, and those ids would be re-bought on every search, forever.
 *
 *   2. THE CLAIM-LOCK — two orgs searching seconds apart both see the same id as
 *      unbought and both collect it. Solved with the primary key rather than a
 *      distributed lock: INSERT ... ON CONFLICT DO NOTHING RETURNING. Whoever wins
 *      the insert owns the fetch.
 *
 *   3. THE REFRESH CLOCK — `last_fetched_at`, so a deliberate re-buy for freshness
 *      is deliberate and everything else is free.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'
import { logger } from '@/lib/logger'

type Supabase = SupabaseClient<Database>
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LooseSb = any

export type VendorRecordState = 'claimed' | 'fetched' | 'unusable' | 'failed'

/** A claim older than this with no settle is treated as an abandoned worker. */
export const STALE_CLAIM_MINUTES = 10

export interface BuyPlan {
  /** Everything the free search matched. */
  matched: string[]
  /** Already paid for — serve from the pool, spend nothing. */
  owned: string[]
  /** Held but past TTL and worth re-buying, if the caller asked for refresh. */
  stale: string[]
  /** Never seen. These cost money. */
  unseen: string[]
  /** Paid for once and resolved to nothing. NEVER buy again. */
  unusable: string[]
}

/**
 * Split a free-search id set into what we own and what we'd have to buy. Reads
 * only — makes no claim and spends nothing, so it is safe to call to produce the
 * pre-flight estimate the UI shows before the client commits.
 *
 * `ttlDays` comes from pool_sources.retention_days. Null means held records never
 * go stale and are never re-bought.
 */
export async function planBuy(
  supabase: Supabase,
  sourceKey: string,
  matchedIds: string[],
  opts: { ttlDays?: number | null; now?: Date } = {},
): Promise<BuyPlan> {
  const sb = supabase as unknown as LooseSb
  const matched = Array.from(new Set(matchedIds.filter(Boolean)))
  if (!matched.length) return { matched: [], owned: [], stale: [], unseen: [], unusable: [] }

  // Chunked: a free search page is 1,000 ids and PostgREST has URL length limits.
  const known = new Map<string, { state: VendorRecordState; last_fetched_at: string | null }>()
  for (let i = 0; i < matched.length; i += 500) {
    const { data, error } = await sb
      .from('pool_vendor_records')
      .select('external_id,state,last_fetched_at')
      .eq('source_key', sourceKey)
      .in('external_id', matched.slice(i, i + 500))
    if (error) throw error
    for (const r of (data ?? []) as { external_id: string; state: VendorRecordState; last_fetched_at: string | null }[]) {
      known.set(r.external_id, { state: r.state, last_fetched_at: r.last_fetched_at })
    }
  }

  const now = opts.now ?? new Date()
  const ttlMs = opts.ttlDays != null ? opts.ttlDays * 86_400_000 : null
  const plan: BuyPlan = { matched, owned: [], stale: [], unseen: [], unusable: [] }

  for (const id of matched) {
    const rec = known.get(id)
    if (!rec) {
      plan.unseen.push(id)
      continue
    }
    if (rec.state === 'unusable') {
      plan.unusable.push(id)
      continue
    }
    if (rec.state === 'failed') {
      // Errored before we were charged — safe to retry.
      plan.unseen.push(id)
      continue
    }
    // 'claimed' counts as owned: someone else is fetching it right now.
    plan.owned.push(id)
    if (rec.state === 'fetched' && ttlMs != null) {
      const age = rec.last_fetched_at ? now.getTime() - new Date(rec.last_fetched_at).getTime() : Infinity
      if (age > ttlMs) plan.stale.push(id)
    }
  }
  return plan
}

/**
 * Claim the right to fetch these ids. Returns ONLY the ids this caller won — fetch
 * exactly those and nothing else. The unique primary key does the mutual exclusion,
 * so two concurrent searches can never both pay for one record.
 *
 * `refresh: true` also re-claims ids already held (a deliberate re-buy), by
 * flipping them back to 'claimed'.
 */
export async function claimVendorIds(
  supabase: Supabase,
  sourceKey: string,
  ids: string[],
  opts: { refresh?: boolean } = {},
): Promise<string[]> {
  const sb = supabase as unknown as LooseSb
  const unique = Array.from(new Set(ids.filter(Boolean)))
  if (!unique.length) return []

  const won: string[] = []
  for (let i = 0; i < unique.length; i += 500) {
    const chunk = unique.slice(i, i + 500)
    const rows = chunk.map((external_id) => ({
      source_key: sourceKey,
      external_id,
      state: 'claimed' as const,
      claimed_at: new Date().toISOString(),
    }))
    // ignoreDuplicates:true → ON CONFLICT DO NOTHING. Only genuinely new rows come
    // back, and those are the ids this caller is allowed to spend on.
    const { data, error } = await sb
      .from('pool_vendor_records')
      .upsert(rows, { onConflict: 'source_key,external_id', ignoreDuplicates: true })
      .select('external_id')
    if (error) throw error
    for (const r of (data ?? []) as { external_id: string }[]) won.push(r.external_id)

    if (opts.refresh) {
      // A deliberate re-buy: take back ids we already hold. Restricted to 'fetched'
      // so we never steal an id another worker is mid-fetch on.
      const notWon = chunk.filter((id) => !won.includes(id))
      if (notWon.length) {
        const { data: re } = await sb
          .from('pool_vendor_records')
          .update({ state: 'claimed', claimed_at: new Date().toISOString() })
          .eq('source_key', sourceKey)
          .eq('state', 'fetched')
          .in('external_id', notWon)
          .select('external_id')
        for (const r of (re ?? []) as { external_id: string }[]) won.push(r.external_id)
      }
    }
  }
  return won
}

/**
 * Record the outcome of a fetch we were charged for. Called for EVERY claimed id,
 * including the failures — an unsettled claim is a leaked lock, and an unrecorded
 * charge is money we will spend again.
 */
export async function settleVendorRecord(
  supabase: Supabase,
  sourceKey: string,
  externalId: string,
  outcome: { state: Exclude<VendorRecordState, 'claimed'>; profileId?: string | null; credits?: number },
): Promise<void> {
  const sb = supabase as unknown as LooseSb
  const nowIso = new Date().toISOString()
  const { data: existing } = await sb
    .from('pool_vendor_records')
    .select('fetch_count,credits_spent,first_fetched_at')
    .eq('source_key', sourceKey)
    .eq('external_id', externalId)
    .maybeSingle()

  const charged = outcome.state !== 'failed'
  const patch: Record<string, unknown> = {
    state: outcome.state,
    profile_id: outcome.profileId ?? null,
    credits_spent: (existing?.credits_spent ?? 0) + (outcome.credits ?? 0),
  }
  if (charged) {
    patch.fetch_count = (existing?.fetch_count ?? 0) + 1
    patch.last_fetched_at = nowIso
    patch.first_fetched_at = existing?.first_fetched_at ?? nowIso
  }

  const { error } = await sb
    .from('pool_vendor_records')
    .update(patch)
    .eq('source_key', sourceKey)
    .eq('external_id', externalId)
  if (error) throw error
}

/**
 * Release claims abandoned by a crashed worker, so a dead process can't wedge an id
 * out of the buyable set forever. Run from the queue worker, not on the hot path.
 */
export async function releaseStaleClaims(
  supabase: Supabase,
  olderThanMinutes = STALE_CLAIM_MINUTES,
): Promise<number> {
  const sb = supabase as unknown as LooseSb
  const cutoff = new Date(Date.now() - olderThanMinutes * 60_000).toISOString()
  // Delete rather than mark: a claim that never settled was never charged, so the
  // honest state is "we have never seen this id".
  const { data, error } = await sb
    .from('pool_vendor_records')
    .delete()
    .eq('state', 'claimed')
    .lt('claimed_at', cutoff)
    .select('external_id')
  if (error) throw error
  const n = (data ?? []).length
  if (n) logger.warn('Released stale vendor claims', { count: n, olderThanMinutes })
  return n
}

// ── Run bookkeeping + spend ───────────────────────────────────────────────────

export interface IngestRunInput {
  sourceKey: string
  orgId?: string | null
  jobId?: string | null
  query?: unknown
}

export async function startIngestRun(supabase: Supabase, input: IngestRunInput): Promise<string> {
  const sb = supabase as unknown as LooseSb
  const { data, error } = await sb
    .from('pool_ingest_runs')
    .insert({
      source_key: input.sourceKey,
      org_id: input.orgId ?? null,
      job_id: input.jobId ?? null,
      query: input.query ?? null,
    })
    .select('id')
    .single()
  if (error) throw error
  return data.id as string
}

export interface IngestRunTotals {
  ids_matched?: number
  ids_owned?: number
  ids_bought?: number
  profiles_created?: number
  profiles_merged?: number
  records_unusable?: number
  credits_used?: number
  error?: string | null
}

export async function finishIngestRun(
  supabase: Supabase,
  runId: string,
  totals: IngestRunTotals,
): Promise<void> {
  const sb = supabase as unknown as LooseSb
  await sb
    .from('pool_ingest_runs')
    .update({ ...totals, finished_at: new Date().toISOString() })
    .eq('id', runId)
}

/**
 * One row per vendor API call, successful or not. Mirrors `ai_usage` (migration
 * 086) on purpose: "cost per client" should be the same query shape across the AI
 * meter and the vendor meter. Best-effort — a ledger write must never take down an
 * ingest that already spent the money.
 */
export async function recordVendorCall(
  supabase: Supabase,
  call: {
    sourceKey: string
    endpoint: 'search' | 'collect' | 'enrich'
    orgId?: string | null
    runId?: string | null
    ok?: boolean
    credits?: number
    recordsReturned?: number
    estimatedCostUsd?: number
  },
): Promise<void> {
  try {
    await (supabase as unknown as LooseSb).from('pool_vendor_calls').insert({
      source_key: call.sourceKey,
      org_id: call.orgId ?? null,
      ingest_run_id: call.runId ?? null,
      endpoint: call.endpoint,
      ok: call.ok ?? true,
      credits: call.credits ?? 0,
      records_returned: call.recordsReturned ?? 0,
      estimated_cost_usd: call.estimatedCostUsd ?? 0,
    })
  } catch (err) {
    logger.warn('pool_vendor_calls insert failed', {
      error: err instanceof Error ? err.message : String(err),
    })
  }
}

/**
 * Record that an org has seen a profile — the reuse-factor input (§1h). Idempotent
 * per (profile, org): the stored fact is the FIRST time they saw it.
 */
export async function recordProfileViews(
  supabase: Supabase,
  orgId: string,
  profileIds: string[],
): Promise<void> {
  if (!profileIds.length) return
  try {
    await (supabase as unknown as LooseSb).from('pool_profile_views').upsert(
      Array.from(new Set(profileIds)).map((profile_id) => ({ profile_id, org_id: orgId })),
      { onConflict: 'profile_id,org_id', ignoreDuplicates: true },
    )
  } catch (err) {
    logger.warn('pool_profile_views upsert failed', {
      error: err instanceof Error ? err.message : String(err),
    })
  }
}
