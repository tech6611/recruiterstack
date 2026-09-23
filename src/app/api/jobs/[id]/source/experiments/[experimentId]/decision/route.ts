import { NextResponse } from 'next/server'
import { z } from 'zod'
import { withCapability, parseBody, handleSupabaseError } from '@/lib/api/helpers'
import { setExperimentDecision } from '@/modules/ats/domain/sourcing-experiments'

const bodySchema = z.object({
  variant: z.enum(['baseline', 'challenger']),
  profile_id: z.string().uuid(),
  decision: z.enum(['yes', 'maybe', 'no']).nullable(),
})

/** POST — recruiter verdict for a candidate in one experimental sourcing arm. */
export const POST = withCapability('recruiting:edit', async (req, orgId, supabase, { params }) => {
  const body = await parseBody(req, bodySchema)
  if (body instanceof NextResponse) return body
  try {
    const experiment = await setExperimentDecision(supabase, orgId, params.id, params.experimentId, body.variant, body.profile_id, body.decision)
    return NextResponse.json({ data: experiment })
  } catch (error) {
    return handleSupabaseError(error as { code: string; message: string })
  }
})
