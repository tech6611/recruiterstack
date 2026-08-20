import { NextResponse } from 'next/server'
import { z } from 'zod'
import { withCapability, parseBody, handleSupabaseError } from '@/lib/api/helpers'
import { setSourcingDecision } from '@/modules/ats/domain/sourcing'
import { logDecision } from '@/modules/ats/domain/scoring-feedback'

const bodySchema = z.object({
  candidate_id: z.string().uuid(),
  decision: z.enum(['yes', 'no', 'maybe']).nullable(),
})

/** POST — record a yes/no/maybe on a sourced candidate (calibration). These
 *  decisions feed the ICP feedback loop alongside pipeline decisions. */
export const POST = withCapability('recruiting:edit', async (req, orgId, supabase, { params }, _scope, userId) => {
  const body = await parseBody(req, bodySchema)
  if (body instanceof NextResponse) return body
  try {
    await setSourcingDecision(supabase, orgId, params.id, body.candidate_id, body.decision, userId)
    // Freeze a point-in-time training row for the ICP learning loop (best-effort;
    // only actual decisions, not an un-decide back to null).
    if (body.decision) {
      await logDecision(supabase, orgId, {
        jobId: params.id,
        candidateId: body.candidate_id,
        applicationId: null,
        source: 'sourcing',
        decision: body.decision,
        decidedBy: userId,
      })
    }
    return NextResponse.json({ data: { ok: true } })
  } catch (e) {
    return handleSupabaseError(e as { code: string; message: string })
  }
})
