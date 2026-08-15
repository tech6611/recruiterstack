import { NextResponse } from 'next/server'
import { withCapability, handleSupabaseError } from '@/lib/api/helpers'
import { getIcpVersions } from '@/modules/ats/domain/icp'

/** GET — the full ICP version history for this job, newest first. */
export const GET = withCapability('recruiting:view', async (_req, orgId, supabase, { params }) => {
  try {
    const versions = await getIcpVersions(supabase, orgId, params.id)
    return NextResponse.json({ data: versions })
  } catch (e) {
    return handleSupabaseError(e as { code: string; message: string })
  }
})
