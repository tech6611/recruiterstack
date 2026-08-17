import { NextResponse } from 'next/server'
import { withCapability, handleSupabaseError } from '@/lib/api/helpers'
import { getCurrentIcp } from '@/modules/ats/domain/icp'
import { sourcePoolForIcp, savePoolMatches, getCachedPoolMatches } from '@/modules/pool/domain/pool-sourcing'

export const maxDuration = 300 // Fit-Engine scores the pool shortlist

/** GET — the cached market shortlist for this job (so it survives a refresh). */
export const GET = withCapability('recruiting:view', async (_req, orgId, supabase, { params }) => {
  try {
    const icp = await getCurrentIcp(supabase, orgId, params.id).catch(() => null)
    const cached = await getCachedPoolMatches(supabase, orgId, params.id, icp?.version ?? null)
    return NextResponse.json({ data: { matches: cached?.matches ?? [], stale: cached?.stale ?? false, cached: !!cached } })
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
    const result = await sourcePoolForIcp(supabase, orgId, icp, { orgId, userId })
    if (result.status === 'ok') {
      await savePoolMatches(supabase, orgId, params.id, icp.version, result.matches).catch(() => {})
    }
    return NextResponse.json({ data: result })
  } catch (e) {
    return handleSupabaseError(e as { code: string; message: string })
  }
})
