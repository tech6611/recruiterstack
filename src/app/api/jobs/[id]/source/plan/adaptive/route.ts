import { NextResponse } from 'next/server'
import { withCapability, handleSupabaseError } from '@/lib/api/helpers'
import { getCurrentIcp } from '@/modules/ats/domain/icp'
import { getJobRoleContext } from '@/modules/ats/domain/job-role-context'
import { resolveSearchSpec } from '@/modules/pool/search/spec-from-brief'
import { compileSpec } from '@/modules/pool/vendors/crustdata/compile-spec'
import { searchPeople, crustdataConfigured } from '@/modules/pool/vendors/crustdata/client'
import { runAdaptivePlan, type LevelCount } from '@/modules/pool/search/adaptive-plan'
import { proposeNextMove } from '@/lib/ai/next-move'
import type { SearchSpec } from '@/lib/types/search-spec'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LooseSb = any

const DEFAULT_TARGET = 60
export const maxDuration = 300

/**
 * POST — #3 adaptive planner. Probes each level's reach against the per-role target and,
 * while short, asks the brain for the next expansion (more same-space companies → feeder
 * titles → wider location), until the target is met or there's no next move. PROPOSE-ONLY:
 * returns the expanded plan + reasoning + per-level counts; it never acquires anyone (only
 * cheap limit:1 count probes are spent). The recruiter reviews/edits before "Find people".
 */
export const POST = withCapability('recruiting:edit', async (_req, orgId, supabase, { params }, _scope, userId) => {
  if (!crustdataConfigured()) return NextResponse.json({ error: 'The market source is not configured.' }, { status: 503 })
  try {
    const icp = await getCurrentIcp(supabase, orgId, params.id)
    if (!icp) return NextResponse.json({ error: 'Approve an ICP for this job first.' }, { status: 400 })

    const [{ data: job }, roleContext] = await Promise.all([
      (supabase as unknown as LooseSb).from('jobs').select('title').eq('id', params.id).maybeSingle(),
      getJobRoleContext(supabase, orgId, params.id),
    ])
    const { spec } = resolveSearchSpec(icp, { title: job?.title ?? null, roleContext })
    const brief = icp.sourcing_map?.recruiter_brief ?? null
    const target = brief?.target?.qualified_leads ?? DEFAULT_TARGET
    const remote = roleContext?.market?.work_model === 'remote'

    // Sensor: one limit:1 vendor probe per level → its reachable count.
    const probe = async (s: SearchSpec): Promise<LevelCount[]> => {
      const compiled = compileSpec(s)
      return Promise.all(
        compiled.lanes.map(async (lane) => {
          try {
            const r = await searchPeople(lane.filters, { limit: 1 })
            return { key: lane.key, label: lane.label, total: r.totalCount }
          } catch {
            return { key: lane.key, label: lane.label, total: null }
          }
        }),
      )
    }

    const result = await runAdaptivePlan({
      spec,
      target,
      probe,
      nextMove: (ctx) => proposeNextMove(brief, ctx, { remote, identity: { orgId, userId } }),
    })

    return NextResponse.json({ data: result })
  } catch (e) {
    return handleSupabaseError(e as { code: string; message: string })
  }
})
