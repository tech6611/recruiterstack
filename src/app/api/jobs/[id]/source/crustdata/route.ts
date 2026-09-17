import { NextResponse } from 'next/server'
import { withCapability, handleSupabaseError } from '@/lib/api/helpers'
import { getCurrentIcp } from '@/modules/ats/domain/icp'
import type { Icp } from '@/lib/types/icp'
import { sourceFromIcp, EmptyIcpQueryError } from '@/modules/pool/domain/crustdata-acquire'
import { CrustdataConfigError } from '@/modules/pool/vendors/crustdata/client'
import { sourcePoolForIcp, savePoolMatches, embedPoolProfiles } from '@/modules/pool/domain/pool-sourcing'

export const maxDuration = 300 // live vendor fetch + embed + Fit-Engine scoring

/** Default people fetched per run — kept low on purpose; capped so a bad request can't overspend. */
const DEFAULT_COUNT = 3
const MAX_COUNT = 25

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LooseSb = any

/** The ICP's ranking parameters — used to build the market matrix columns (mirrors /source/pool). */
function icpColumns(icp: Icp | null) {
  if (!icp || icp.status !== 'approved') return null
  return {
    must_haves: icp.must_haves.map((m) => ({ id: m.id, label: m.label, attribute: m.attribute })),
    competencies: icp.competencies.map((c) => ({ id: c.id, name: c.name, weight: c.weight })),
  }
}

/**
 * POST — source NEW people from Crustdata for this job's approved ICP, then rank the
 * refreshed pool. Flow: translate ICP → fetch a few real profiles into the pool →
 * embed them → semantic recall + Fit-Engine score → cache + return the matrix.
 *
 * Staged: while vendor:crustdata is disabled in pool_sources this returns 409 rather
 * than erroring, so the button degrades cleanly until the source is switched on.
 */
export const POST = withCapability('recruiting:edit', async (req, orgId, supabase, { params }, _scope, userId) => {
  try {
    const icp = await getCurrentIcp(supabase, orgId, params.id).catch(() => null)
    if (!icp || icp.status !== 'approved') {
      return NextResponse.json({ error: 'Approve an ICP for this job before sourcing from Crustdata.' }, { status: 400 })
    }

    // How many to fetch (default 3, hard-capped). Body is optional.
    let count = DEFAULT_COUNT
    try {
      const body = (await req.json()) as { count?: number }
      if (typeof body?.count === 'number' && Number.isFinite(body.count)) {
        count = Math.min(MAX_COUNT, Math.max(1, Math.floor(body.count)))
      }
    } catch {
      /* no body — use the default */
    }

    // The role title lives on the job, not the ICP — it anchors the query.
    const { data: job } = await (supabase as unknown as LooseSb)
      .from('jobs')
      .select('title')
      .eq('id', params.id)
      .maybeSingle()

    // 1. Fetch + ingest fresh Crustdata people for this ICP.
    let sourced
    try {
      sourced = await sourceFromIcp(
        supabase,
        icp,
        { title: job?.title ?? null },
        { perPage: count, maxRecords: count, orgId, jobId: params.id },
      )
    } catch (err) {
      if (err instanceof CrustdataConfigError) {
        return NextResponse.json({ error: 'Crustdata is not configured (missing API key).' }, { status: 503 })
      }
      if (err instanceof EmptyIcpQueryError) {
        return NextResponse.json(
          { error: 'This ICP has no Crustdata-searchable requirements yet — add a title, location, or experience gate.' },
          { status: 400 },
        )
      }
      if (err instanceof Error && /disabled/i.test(err.message)) {
        return NextResponse.json(
          { error: "Crustdata sourcing isn't enabled for your workspace yet.", code: 'source_disabled' },
          { status: 409 },
        )
      }
      throw err
    }

    // 2. Embed the newly ingested profiles so semantic recall can find them.
    await embedPoolProfiles(supabase, sourced.ingest.needsReembed).catch(() => {})

    // 3. Rank the refreshed pool against the ICP, and cache the shortlist.
    const result = await sourcePoolForIcp(supabase, orgId, icp, { orgId, userId })
    if (result.status === 'ok') {
      await savePoolMatches(supabase, orgId, params.id, icp.version, result.matches).catch(() => {})
    }

    return NextResponse.json({
      data: {
        sourced: {
          fetched: sourced.fetched,
          matched: sourced.matched,
          creditsUsed: sourced.creditsUsed,
          created: sourced.ingest.created,
          merged: sourced.ingest.merged,
          unmappedRequirements: sourced.query.unmapped,
        },
        ...result,
        icp: icpColumns(icp),
      },
    })
  } catch (e) {
    return handleSupabaseError(e as { code: string; message: string })
  }
})
