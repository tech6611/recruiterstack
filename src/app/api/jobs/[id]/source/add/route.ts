import { NextResponse } from 'next/server'
import { z } from 'zod'
import { withCapability, parseBody, handleSupabaseError } from '@/lib/api/helpers'
import { getFirstLeadStage } from '@/modules/ats/domain/job-pipelines'
import { insertPipelineApplication, listExistingApplicationCandidateIds } from '@/modules/ats/domain/applications'

const bodySchema = z.object({ candidate_ids: z.array(z.string().uuid()).min(1).max(50) })

/** POST — add sourced candidates to this job's LEAD funnel as applications
 *  (source: 'sourced', lifecycle: 'lead'), into the first lead stage ("New lead").
 *  They're engaged in the lead zone first and convert to the active pipeline only
 *  when they reply/apply. Skips any already in the pipeline. */
export const POST = withCapability('recruiting:edit', async (req, orgId, supabase, { params }) => {
  const body = await parseBody(req, bodySchema)
  if (body instanceof NextResponse) return body
  const jobId = params.id

  try {
    const { stage, lifecycle } = await getFirstLeadStage(supabase, orgId, jobId)
    const existing = await listExistingApplicationCandidateIds(supabase, orgId, jobId, body.candidate_ids)
    const existingIds = new Set((existing ?? []).map((e: { candidate_id: string }) => e.candidate_id))
    const toAdd = body.candidate_ids.filter((id) => !existingIds.has(id))

    let added = 0
    for (const candidateId of toAdd) {
      const { data: app, error } = await insertPipelineApplication(supabase, orgId, {
        candidateId,
        jobId,
        stageId: stage?.id ?? null,
        source: 'sourced',
        lifecycle,
      })
      if (error || !app) continue
      await supabase.from('application_events').insert({
        application_id: app.id,
        event_type: 'sourced',
        note: lifecycle === 'lead' ? 'Sourced into the lead funnel' : 'Added to pipeline from Sourcing',
        created_by: 'Sourcing',
        org_id: orgId,
      } as never)
      added++
    }

    return NextResponse.json({ data: { added, skipped: body.candidate_ids.length - toAdd.length } })
  } catch (e) {
    return handleSupabaseError(e as { code: string; message: string })
  }
})
