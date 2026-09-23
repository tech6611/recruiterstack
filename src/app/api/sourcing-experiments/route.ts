import { NextResponse } from 'next/server'
import { withCapability, handleSupabaseError } from '@/lib/api/helpers'
import { listOrgSourcingExperiments } from '@/modules/ats/domain/sourcing-experiments'

/** GET — cross-job Sourcing Lab history and recruiter verdict totals. */
export const GET = withCapability('recruiting:view', async (_req, orgId, supabase) => {
  try {
    return NextResponse.json({ data: await listOrgSourcingExperiments(supabase, orgId) })
  } catch (error) {
    return handleSupabaseError(error as { code: string; message: string })
  }
})
