import { NextResponse } from 'next/server'
import { z } from 'zod'
import { withCapability, parseBody, handleSupabaseError } from '@/lib/api/helpers'
import { getFirstJobStage } from '@/modules/ats/domain/job-pipelines'
import { insertPipelineApplication, listExistingApplicationCandidateIds } from '@/modules/ats/domain/applications'
import { findOrCreateCandidateProfile } from '@/modules/ats/domain/candidates'
import { unlockPoolProfile } from '@/modules/pool/domain/pool-unlock'

export const maxDuration = 120

const bodySchema = z.object({ profile_ids: z.array(z.string().uuid()).min(1).max(25) })

/** POST — unlock pool profiles (spending unlock quota, projecting each into a per-org
 *  candidate) and add them to this job's pipeline. One action from the Source tab. */
export const POST = withCapability('recruiting:edit', async (req, orgId, supabase, { params }, _scope, userId) => {
  const body = await parseBody(req, bodySchema)
  if (body instanceof NextResponse) return body
  const jobId = params.id

  try {
    const stage = await getFirstJobStage(supabase, orgId, jobId).catch(() => null)

    let added = 0
    let unlocked = 0
    let skipped = 0
    let quotaExceeded = false

    for (const profileId of body.profile_ids) {
      // `pool` may not import `ats`; this route is the composition layer, so it
      // supplies the projection into candidates.
      const res = await unlockPoolProfile(supabase, orgId, profileId, userId, findOrCreateCandidateProfile)
      if (res.status === 'quota_exceeded') { quotaExceeded = true; break }
      if (res.status !== 'unlocked' && res.status !== 'already') { skipped++; continue }
      if (res.status === 'unlocked') unlocked++

      // Add the projected candidate to this job's pipeline (skip if already there).
      const existing = await listExistingApplicationCandidateIds(supabase, orgId, jobId, [res.candidate_id])
      if (existing && existing.length) { continue }
      const { data: app, error } = await insertPipelineApplication(supabase, orgId, {
        candidateId: res.candidate_id,
        jobId,
        stageId: stage?.id ?? null,
        source: 'sourced',
      })
      if (error || !app) continue
      await supabase.from('application_events').insert({
        application_id: app.id,
        event_type: 'applied',
        note: 'Unlocked from the Candidate Pool + added to pipeline',
        created_by: 'Sourcing',
        org_id: orgId,
      } as never)
      added++
    }

    return NextResponse.json({ data: { added, unlocked, skipped, quota_exceeded: quotaExceeded } })
  } catch (e) {
    return handleSupabaseError(e as { code: string; message: string })
  }
})
