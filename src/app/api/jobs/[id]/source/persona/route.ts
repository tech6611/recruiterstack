import { NextResponse } from 'next/server'
import { withCapability, handleSupabaseError } from '@/lib/api/helpers'
import { getCurrentIcp } from '@/modules/ats/domain/icp'
import { getJobRoleContext } from '@/modules/ats/domain/job-role-context'
import { resolveSearchSpec } from '@/modules/pool/search/spec-from-brief'
import { getPoolAccess, getPoolFacets } from '@/modules/pool/domain/pool'
import { buildPersonaTabs, type PersonaFacets } from '@/lib/persona-tabs'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LooseSb = any

/**
 * GET — the ideal-candidate persona for this job, as six tabs (employers, titles,
 * skills, seniority, years, locations). The targeted values come from the job's
 * ideal profile (the same SearchSpec the editor uses); the pool distribution is
 * added when the org has pool access. Read-only; spends no vendor credits.
 */
export const GET = withCapability('recruiting:view', async (_req, orgId, supabase, { params }) => {
  try {
    const icp = await getCurrentIcp(supabase, orgId, params.id)
    if (!icp) {
      return NextResponse.json({ data: { persona: buildPersonaTabs(null, null), icp_version: null } })
    }
    const [{ data: job }, roleContext, access] = await Promise.all([
      (supabase as unknown as LooseSb).from('jobs').select('title').eq('id', params.id).maybeSingle(),
      getJobRoleContext(supabase, orgId, params.id),
      getPoolAccess(supabase, orgId),
    ])
    const { spec } = resolveSearchSpec(icp, { title: job?.title ?? null, roleContext })

    let facets: PersonaFacets | null = null
    if (access.hasAccess) {
      const f = await getPoolFacets(supabase)
      facets = { companies: f.companies, titles: f.titles, skills: f.skills, cities: f.cities, total: f.total }
    }

    return NextResponse.json({ data: { persona: buildPersonaTabs(spec, facets), icp_version: icp.version } })
  } catch (e) {
    return handleSupabaseError(e as { code: string; message: string })
  }
})
