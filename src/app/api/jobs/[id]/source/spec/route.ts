import { NextResponse } from 'next/server'
import { z } from 'zod'
import { withCapability, parseBody, handleSupabaseError } from '@/lib/api/helpers'
import { getCurrentIcp, setIcpSearchSpec, syncActiveIcpLocationsFromJob } from '@/modules/ats/domain/icp'
import { getJobRoleContext } from '@/modules/ats/domain/job-role-context'
import { resolveSearchSpec } from '@/modules/pool/search/spec-from-brief'
import { searchSpecSchema } from '@/lib/validations/search-spec'
import type { SearchSpec } from '@/lib/types/search-spec'
import { findOrCreateLocation, syncJobLocationIntakeMirror } from '@/lib/jobs/inherit'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LooseSb = any

/** GET — the job's acquisition ladder: the recruiter-edited spec stored on the current
 *  ICP, or the one derived from its brief. Vendor-neutral; the UI edits this. */
export const GET = withCapability('recruiting:view', async (_req, orgId, supabase, { params }) => {
  try {
    const icp = await getCurrentIcp(supabase, orgId, params.id)
    if (!icp) return NextResponse.json({ data: { spec: null, icp_version: null, icp_status: null } })
    const [{ data: job }, roleContext] = await Promise.all([
      (supabase as unknown as LooseSb).from('jobs').select('title').eq('id', params.id).maybeSingle(),
      getJobRoleContext(supabase, orgId, params.id),
    ])
    const { spec, stored } = resolveSearchSpec(icp, { title: job?.title ?? null, roleContext })
    return NextResponse.json({ data: { spec, stored, icp_version: icp.version, icp_status: icp.status } })
  } catch (e) {
    return handleSupabaseError(e as { code: string; message: string })
  }
})

const patchSchema = z.object({ spec: searchSpecSchema })

/** The first (strict) lane defines the market. Wider-location lanes are deliberate
 * recall relaxations and must not rewrite the job's canonical location. */
function strictLocation(spec: SearchSpec): string | null {
  const first = spec.levels?.[0]
  const criterion = first?.criteria.find((c) => c.kind === 'location' && !c.exclude)
  const value = criterion?.values?.[0]
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

/** PATCH — save the recruiter's edited ladder on the current ICP. Edits win over regeneration. */
export const PATCH = withCapability('recruiting:edit', async (req, orgId, supabase, { params }) => {
  const body = await parseBody(req, patchSchema)
  if (body instanceof NextResponse) return body
  try {
    const icp = await getCurrentIcp(supabase, orgId, params.id)
    if (!icp) return NextResponse.json({ error: 'No ICP for this job yet.' }, { status: 400 })
    const market = strictLocation(body.spec as SearchSpec)
    if (market) {
      const locationId = await findOrCreateLocation(supabase, orgId, market)
      if (!locationId) return NextResponse.json({ error: 'Could not resolve the source-plan location.' }, { status: 422 })
      const { error } = await (supabase as unknown as LooseSb)
        .from('jobs').update({ location_id: locationId }).eq('id', params.id).eq('org_id', orgId)
      if (error) return handleSupabaseError(error)
      await syncJobLocationIntakeMirror(supabase, orgId, params.id)
    }
    const saved = await setIcpSearchSpec(supabase, orgId, icp.id, body.spec as SearchSpec)
    if (market) await syncActiveIcpLocationsFromJob(supabase, orgId, params.id)
    return NextResponse.json({ data: { spec: saved.sourcing_map?.search_spec ?? null, stored: true, icp_version: saved.version } })
  } catch (e) {
    return handleSupabaseError(e as { code: string; message: string })
  }
})

/** DELETE — reset to the brief's proposal (drops the stored spec). */
export const DELETE = withCapability('recruiting:edit', async (_req, orgId, supabase, { params }) => {
  try {
    const icp = await getCurrentIcp(supabase, orgId, params.id)
    if (!icp) return NextResponse.json({ error: 'No ICP for this job yet.' }, { status: 400 })
    await setIcpSearchSpec(supabase, orgId, icp.id, null)
    const [{ data: job }, roleContext] = await Promise.all([
      (supabase as unknown as LooseSb).from('jobs').select('title').eq('id', params.id).maybeSingle(),
      getJobRoleContext(supabase, orgId, params.id),
    ])
    const fresh = await getCurrentIcp(supabase, orgId, params.id)
    const { spec } = resolveSearchSpec(fresh!, { title: job?.title ?? null, roleContext })
    return NextResponse.json({ data: { spec, stored: false, icp_version: fresh!.version } })
  } catch (e) {
    return handleSupabaseError(e as { code: string; message: string })
  }
})
