/**
 * The ingest write path (S1). Stages 2, 3, 4 and 6 wired together.
 * See docs/pool-vendor-ingestion-architecture.md §2.
 *
 *   land (pool_documents)  →  map (adapter)  →  resolve (identity)
 *     →  persist claims  →  rebuild (fusion + materialize)
 *
 * Nothing in here knows a vendor's name. It takes a `sourceKey`, asks the registry
 * for an adapter, and treats whatever comes back as claims. That is the property
 * S4 tests: adding a second vendor must not require editing this file.
 */
import crypto from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'
import { requireAdapter } from '@/modules/pool/vendors/registry'
import { isUsable, VendorMapError, type MappedRecord } from '@/modules/pool/vendors/types'
import { normalizeIdentifiers, CONTACT_IDENTIFIER_KINDS } from '@/modules/pool/domain/identity'
import { rebuildProfile, loadTrustConfig, type TrustConfig } from '@/modules/pool/domain/rebuild'
import { settleVendorRecord } from '@/modules/pool/domain/vendor-ledger'
import { logger } from '@/lib/logger'

type Supabase = SupabaseClient<Database>
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LooseSb = any

export type IngestOutcome =
  | { status: 'ingested'; profileId: string; created: boolean; merged: boolean; changed: string[]; needsReembed: boolean }
  | { status: 'unusable'; reason: string }
  | { status: 'failed'; reason: string }

export interface IngestInput {
  sourceKey: string
  payload: unknown
  runId?: string | null
  /** Credits this record cost. Recorded on the ledger row so spend is attributable. */
  credits?: number
  /** Injected for deterministic tests. */
  now?: Date
  trust?: TrustConfig
}

function contentHash(payload: unknown): string {
  return crypto.createHash('sha256').update(JSON.stringify(payload ?? null)).digest('hex')
}

/**
 * Deterministic identity resolution (stage 4, tier one).
 *
 * Order matters — strongest evidence first:
 *   1. we've mapped this exact vendor record before → same profile, by definition
 *   2. a strong identifier (normalized email / linkedin / phone) already on file
 *   3. nobody matches → a new human
 *
 * The probabilistic tier (blocking + scoring + a review queue) is S2/S4 work;
 * `pool_merge_candidates` exists for it. Until then we would rather create a
 * duplicate than silently merge two people — a duplicate is visible and fixable,
 * a bad merge is neither.
 */
export async function resolveProfile(
  supabase: Supabase,
  sourceKey: string,
  record: MappedRecord,
): Promise<{ profileId: string; created: boolean; merged: boolean }> {
  const sb = supabase as unknown as LooseSb

  // 1. Same vendor record, seen before.
  const { data: own } = await sb
    .from('pool_identities')
    .select('profile_id')
    .eq('source_key', sourceKey)
    .eq('external_id', record.externalId)
    .maybeSingle()
  if (own?.profile_id) {
    await sb
      .from('pool_identities')
      .update({ last_seen_at: new Date().toISOString() })
      .eq('source_key', sourceKey)
      .eq('external_id', record.externalId)
    return { profileId: own.profile_id, created: false, merged: false }
  }

  // 2. A strong identifier we already hold, from any source.
  const identifiers = normalizeIdentifiers(record.identifiers)
  for (const id of identifiers) {
    if (!CONTACT_IDENTIFIER_KINDS.includes(id.kind)) continue
    const { data: hit } = await sb
      .from('pool_contacts')
      .select('profile_id')
      .eq('kind', id.kind)
      .eq('value', id.value)
      .limit(1)
      .maybeSingle()
    if (hit?.profile_id) {
      await sb.from('pool_identities').upsert(
        {
          profile_id: hit.profile_id,
          source_key: sourceKey,
          external_id: record.externalId,
          url: record.url,
          confidence: 'high',
          last_seen_at: new Date().toISOString(),
        },
        { onConflict: 'source_key,external_id' },
      )
      return { profileId: hit.profile_id, created: false, merged: true }
    }
  }
  const github = identifiers.find((i) => i.kind === 'github')
  if (github) {
    const { data: gh } = await sb
      .from('pool_identities')
      .select('profile_id')
      .eq('source_key', 'github')
      .eq('external_id', github.value)
      .maybeSingle()
    if (gh?.profile_id) {
      await sb.from('pool_identities').upsert(
        { profile_id: gh.profile_id, source_key: sourceKey, external_id: record.externalId, url: record.url, confidence: 'high' },
        { onConflict: 'source_key,external_id' },
      )
      return { profileId: gh.profile_id, created: false, merged: true }
    }
  }

  // 3. A new human. The row starts empty on purpose — every field on it is written
  // by rebuildProfile() from claims, never here.
  const { data: created, error } = await sb.from('pool_profiles').insert({}).select('id').single()
  if (error) throw error
  await sb.from('pool_identities').insert({
    profile_id: created.id,
    source_key: sourceKey,
    external_id: record.externalId,
    url: record.url,
    confidence: 'high',
  })
  return { profileId: created.id, created: true, merged: false }
}

/**
 * Persist one mapped record's contribution. Idempotent per (profile, source): a
 * re-run replaces this source's rows rather than appending to them, so re-mapping
 * after a mapper fix never double-counts a source's vote.
 */
async function persistContribution(
  supabase: Supabase,
  sourceKey: string,
  profileId: string,
  record: MappedRecord,
): Promise<void> {
  const sb = supabase as unknown as LooseSb

  // Claims. The unique index (profile, field, source, observed_at) makes this an
  // update-in-place on re-run — which only works because observedAt comes from the
  // source rather than the clock.
  const claimRows = record.claims.map((c) => ({
    profile_id: profileId,
    field: c.field,
    value: c.value as never,
    source_key: sourceKey,
    confidence: Math.round(c.confidence),
    observed_at: c.observedAt,
  }))
  if (claimRows.length) {
    const { error } = await sb
      .from('pool_profile_fields')
      .upsert(claimRows, { onConflict: 'profile_id,field,source_key,observed_at' })
    if (error) throw error
  }

  // Dated history: replace this source's contribution wholesale. Merging across
  // sources happens at read time (rebuild), not here.
  await sb.from('pool_experiences').delete().eq('profile_id', profileId).eq('source_key', sourceKey)
  if (record.experiences.length) {
    const { error } = await sb.from('pool_experiences').insert(
      record.experiences.map((e, i) => ({
        profile_id: profileId,
        title: e.title,
        employer: e.employer,
        location: e.location,
        start_date: e.startDate,
        end_date: e.endDate,
        is_current: e.isCurrent,
        summary: e.summary,
        sort_order: i,
        source_key: sourceKey,
      })),
    )
    if (error) throw error
  }

  // Contacts are never replaced — losing a way to reach someone is worse than
  // holding a stale one, and the unique key already prevents duplicates.
  const contactRows = record.contacts
    .map((c) => {
      const norm = normalizeIdentifiers([{ kind: c.kind === 'website' ? 'email' : c.kind, value: c.value }])
      const value = c.kind === 'website' ? c.value.trim() : norm[0]?.value
      return value ? { profile_id: profileId, kind: c.kind, value, source_key: sourceKey, confidence: c.confidence ?? 'high' } : null
    })
    .filter((r): r is NonNullable<typeof r> => r !== null)
  if (contactRows.length) {
    await sb.from('pool_contacts').upsert(contactRows, { onConflict: 'profile_id,kind,value', ignoreDuplicates: true })
  }
}

/**
 * Land → map → resolve → persist → rebuild, for one purchased record.
 *
 * Every exit path settles the ledger row, because an unsettled claim is a leaked
 * lock and an unrecorded charge is money we will spend twice. In particular a
 * payload we were charged for but cannot use is recorded as 'unusable' — that is
 * the whole reason pool_vendor_records exists.
 */
export async function ingestVendorRecord(supabase: Supabase, input: IngestInput): Promise<IngestOutcome> {
  const sb = supabase as unknown as LooseSb
  const { sourceKey, payload, runId = null, credits = 0 } = input
  let externalId: string | null = null

  try {
    const adapter = requireAdapter(sourceKey)
    const record = adapter.map(payload)
    externalId = record.externalId

    if (!isUsable(record)) {
      await settleVendorRecord(supabase, sourceKey, record.externalId, { state: 'unusable', credits })
      return { status: 'unusable', reason: 'record has no name/history or no identifier' }
    }

    // LAND FIRST. Mapping logic changes constantly; the raw payload is what lets
    // every future change be a re-run instead of a re-buy.
    const hash = contentHash(payload)
    const { data: seen } = await sb
      .from('pool_documents')
      .select('id')
      .eq('source_key', sourceKey)
      .eq('external_id', record.externalId)
      .eq('content_hash', hash)
      .maybeSingle()

    const { profileId, created, merged } = await resolveProfile(supabase, sourceKey, record)

    if (!seen) {
      await sb.from('pool_documents').insert({
        source_key: sourceKey,
        external_id: record.externalId,
        url: record.url,
        content_hash: hash,
        payload: payload as never,
        profile_id: profileId,
        vendor_updated_at: record.vendorUpdatedAt,
        ingest_run_id: runId,
      })
    } else {
      // Same bytes as before, but the profile link may be new (backfill / re-resolve).
      await sb.from('pool_documents').update({ profile_id: profileId }).eq('id', seen.id)
    }

    await persistContribution(supabase, sourceKey, profileId, record)

    const trust = input.trust ?? (await loadTrustConfig(supabase))
    const rebuilt = await rebuildProfile(supabase, profileId, trust, input.now)

    await settleVendorRecord(supabase, sourceKey, record.externalId, { state: 'fetched', profileId, credits })

    return {
      status: 'ingested',
      profileId,
      created,
      merged,
      changed: rebuilt.changed,
      needsReembed: rebuilt.needsReembed,
    }
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err)
    // A VendorMapError means we were charged and the payload is worthless — record
    // it so we never buy that id again. Anything else may be transient, so leave the
    // id retryable.
    const state = err instanceof VendorMapError ? 'unusable' : 'failed'
    const id = externalId ?? (err instanceof VendorMapError ? err.externalId : undefined)
    if (id) {
      await settleVendorRecord(supabase, sourceKey, id, { state, credits: state === 'unusable' ? credits : 0 }).catch(
        () => undefined,
      )
    }
    logger.warn('Vendor record ingest failed', { sourceKey, externalId: id, state, reason })
    return state === 'unusable' ? { status: 'unusable', reason } : { status: 'failed', reason }
  }
}

export interface BatchIngestTotals {
  ingested: number
  created: number
  merged: number
  unusable: number
  failed: number
  needsReembed: string[]
}

/** Ingest a batch of purchased payloads, sharing one trust config. */
export async function ingestVendorRecords(
  supabase: Supabase,
  sourceKey: string,
  payloads: unknown[],
  opts: { runId?: string | null; creditsPerRecord?: number; now?: Date; concurrency?: number } = {},
): Promise<BatchIngestTotals> {
  const trust = await loadTrustConfig(supabase)
  const concurrency = opts.concurrency ?? 5
  const totals: BatchIngestTotals = { ingested: 0, created: 0, merged: 0, unusable: 0, failed: 0, needsReembed: [] }

  for (let i = 0; i < payloads.length; i += concurrency) {
    const results = await Promise.all(
      payloads.slice(i, i + concurrency).map((payload) =>
        ingestVendorRecord(supabase, {
          sourceKey,
          payload,
          runId: opts.runId,
          credits: opts.creditsPerRecord ?? 0,
          now: opts.now,
          trust,
        }),
      ),
    )
    for (const r of results) {
      if (r.status === 'ingested') {
        totals.ingested++
        if (r.created) totals.created++
        if (r.merged) totals.merged++
        if (r.needsReembed) totals.needsReembed.push(r.profileId)
      } else if (r.status === 'unusable') totals.unusable++
      else totals.failed++
    }
  }
  return totals
}
