import { NextResponse } from 'next/server'
import { withCapability, handleSupabaseError } from '@/lib/api/helpers'
import { getCurrentIcp } from '@/modules/ats/domain/icp'
import type { Icp } from '@/lib/types/icp'
import { sourcePoolForIcp, savePoolMatches, getCachedPoolMatches } from '@/modules/pool/domain/pool-sourcing'
import { loadAcquiredLevels } from '@/modules/pool/domain/crustdata-acquire'
import { resolveSearchSpec, feederEmployersFromSpec, planEveryone } from '@/modules/pool/search/spec-from-brief'
import { getJobRoleContext } from '@/modules/ats/domain/job-role-context'

export const maxDuration = 300 // Fit-Engine scores the pool shortlist

/** The ICP's ranking parameters — used to build the market matrix columns. */
function icpColumns(icp: Icp | null) {
  if (!icp || icp.status !== 'approved') return null
  return {
    // Screening gates (nothing a profile can answer) are not columns — a cell would read as ✓.
    must_haves: icp.must_haves.filter((m) => m.attribute !== 'screening').map((m) => ({ id: m.id, label: m.label, attribute: m.attribute, relax_at: m.relax_at ?? null, kind: m.kind, enforcement: m.enforcement })),
    competencies: icp.competencies.map((c) => ({ id: c.id, name: c.name, weight: c.weight })),
  }
}


/** Ideal-profile ladder: gate label → the level it relaxes at (expected misses aren't failures). */
function relaxAtByLabel(icp: Icp | null): Record<string, number | null | undefined> {
  return Object.fromEntries((icp?.must_haves ?? []).map((m) => [m.label, m.relax_at ?? null]))
}

/** GET — the cached market shortlist for this job (so it survives a refresh). */
export const GET = withCapability('recruiting:view', async (_req, orgId, supabase, { params }) => {
  try {
    const icp = await getCurrentIcp(supabase, orgId, params.id).catch(() => null)
    // The current Everyone line, so an older snapshot is folded and ordered under today's plan.
    let plan = null
    if (icp) {
      const roleContext = await getJobRoleContext(supabase, orgId, params.id).catch(() => undefined)
      plan = planEveryone(resolveSearchSpec(icp, { roleContext }).spec)
    }
    const cached = await getCachedPoolMatches(supabase, orgId, params.id, icp?.version ?? null, plan, relaxAtByLabel(icp))
    return NextResponse.json({ data: { matches: cached?.matches ?? [], stale: cached?.stale ?? false, cached: !!cached, icp: icpColumns(icp) } })
  } catch (e) {
    return handleSupabaseError(e as { code: string; message: string })
  }
})

/** POST — source the cross-org Candidate Pool (Pool B) against this job's approved
 *  ICP. Returns ICP-ranked market profiles to unlock + add, and caches them. */
export const POST = withCapability('recruiting:edit', async (_req, orgId, supabase, { params }, _scope, userId) => {
  try {
    const icp = await getCurrentIcp(supabase, orgId, params.id).catch(() => null)
    if (!icp || icp.status !== 'approved') {
      return NextResponse.json({ error: 'Approve an ICP for this job before sourcing the market.' }, { status: 400 })
    }
    // People already acquired for this job keep their ladder level and are always scored.
    const acquired = await loadAcquiredLevels(supabase, params.id)
    const roleContext = await getJobRoleContext(supabase, orgId, params.id)
    const { spec } = resolveSearchSpec(icp, { roleContext })
    const result = await sourcePoolForIcp(supabase, orgId, icp, { orgId, userId }, { includeIds: Object.keys(acquired), acquired, feederEmployers: feederEmployersFromSpec(spec), plan: planEveryone(spec), relaxAtByLabel: relaxAtByLabel(icp) })
    if (result.status === 'ok') {
      await savePoolMatches(supabase, orgId, params.id, icp.version, result.matches).catch(() => {})
    }
    return NextResponse.json({ data: { ...result, icp: icpColumns(icp) } })
  } catch (e) {
    return handleSupabaseError(e as { code: string; message: string })
  }
})
