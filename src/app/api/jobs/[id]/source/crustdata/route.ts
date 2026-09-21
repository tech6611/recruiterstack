import { NextResponse } from 'next/server'
import { withCapability, handleSupabaseError } from '@/lib/api/helpers'
import { getCurrentIcp } from '@/modules/ats/domain/icp'
import type { Icp } from '@/lib/types/icp'
import { sourceFromIcp, EmptyIcpQueryError, loadAcquiredLevels } from '@/modules/pool/domain/crustdata-acquire'
import { CrustdataConfigError } from '@/modules/pool/vendors/crustdata/client'
import { sourcePoolForIcp, savePoolMatches, embedPoolProfiles } from '@/modules/pool/domain/pool-sourcing'
import { getJobRoleContext } from '@/modules/ats/domain/job-role-context'
import { resolveSearchSpec, feederEmployersFromSpec, planEveryone } from '@/modules/pool/search/spec-from-brief'

export const maxDuration = 300 // live vendor fetch + embed + Fit-Engine scoring

/** Default people fetched per run, spread across the plan's lanes (~0.03 credit each);
 *  capped so a bad request can't overspend. */
const DEFAULT_COUNT = 10
const MAX_COUNT = 25

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LooseSb = any

/** The ICP's ranking parameters — used to build the market matrix columns (mirrors /source/pool). */
function icpColumns(icp: Icp | null) {
  if (!icp || icp.status !== 'approved') return null
  return {
    // Screening gates (nothing a profile can answer) are not columns — a cell would read as ✓.
    must_haves: icp.must_haves.filter((m) => m.attribute !== 'screening').map((m) => ({ id: m.id, label: m.label, attribute: m.attribute, relax_at: m.relax_at ?? null })),
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

    // The role title lives on the job, not the ICP — it anchors the titles lane; the
    // market (structured location) becomes every lane's geo radius.
    const [{ data: job }, roleContext] = await Promise.all([
      (supabase as unknown as LooseSb).from('jobs').select('title').eq('id', params.id).maybeSingle(),
      getJobRoleContext(supabase, orgId, params.id),
    ])

    // 1. Run the ICP's search plan (feeder lanes + title families) and ingest the people.
    let sourced
    try {
      sourced = await sourceFromIcp(
        supabase,
        icp,
        { title: job?.title ?? null, roleContext },
        { perPage: count, maxRecords: count, orgId, jobId: params.id },
      )
    } catch (err) {
      if (err instanceof CrustdataConfigError) {
        return NextResponse.json({ error: 'Crustdata is not configured (missing API key).' }, { status: 503 })
      }
      if (err instanceof EmptyIcpQueryError) {
        return NextResponse.json(
          { error: 'The search plan has no level the market source can search on — add a school, employer or title to a level.' },
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

    // 3. Rank the refreshed pool against the ICP — every profile bought this run is
    //    scored whether or not semantic recall would have surfaced it — and cache.
    const acquired = { ...(await loadAcquiredLevels(supabase, params.id)), ...sourced.acquired }
    const { spec } = resolveSearchSpec(icp, { title: job?.title ?? null, roleContext })
    const result = await sourcePoolForIcp(supabase, orgId, icp, { orgId, userId }, { includeIds: Object.keys(acquired), acquired, feederEmployers: feederEmployersFromSpec(spec), plan: planEveryone(spec), relaxAtByLabel: Object.fromEntries(icp.must_haves.map((m) => [m.label, m.relax_at ?? null])) })
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
          unmappedRequirements: sourced.plan.unmapped,
          plan: sourced.plan,
          profileIds: sourced.profileIds,
          acquired: sourced.acquired,
        },
        ...result,
        icp: icpColumns(icp),
      },
    })
  } catch (e) {
    return handleSupabaseError(e as { code: string; message: string })
  }
})
