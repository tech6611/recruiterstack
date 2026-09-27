import { NextResponse } from 'next/server'
import { withCapability } from '@/lib/api/helpers'
import { findOrCreateCandidateProfile } from '@/modules/ats/domain/candidates'
import { unlockPoolProfile } from '@/modules/pool/domain/pool-unlock'

export const maxDuration = 60

/**
 * POST /api/pool/[id]/unlock — spend an unlock and copy this profile into the org's
 * own candidates.
 *
 * Unlocking already existed, but only from a job's Source tab, where it also adds the
 * person to that pipeline. Browsing the pool and wanting someone in your candidates
 * without picking a job first is a perfectly ordinary thing to want, and there was no
 * way to do it. This is the same domain call without the pipeline step.
 */
export const POST = withCapability('recruiting:edit', async (_req, orgId, supabase, { params }, _scope, userId) => {
  const result = await unlockPoolProfile(
    supabase,
    orgId,
    params.id,
    userId,
    (sb, org, input) => findOrCreateCandidateProfile(sb, org, input),
  )

  const status =
    result.status === 'no_access' ? 403 :
    result.status === 'quota_exceeded' ? 402 :
    result.status === 'not_found' ? 404 :
    result.status === 'no_contact' ? 409 :
    result.status === 'error' ? 502 : 200

  return NextResponse.json({ result }, { status })
})
