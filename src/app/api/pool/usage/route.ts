import { NextResponse } from 'next/server'
import { withCapability, handleSupabaseError } from '@/lib/api/helpers'
import { getPoolUsage } from '@/modules/pool/domain/pool-usage'

/** GET — the org's Candidate Pool usage: quota, unlocks spent/remaining, and history. */
export const GET = withCapability('recruiting:view', async (_req, orgId, supabase) => {
  try {
    const data = await getPoolUsage(supabase, orgId)
    return NextResponse.json({ data })
  } catch (e) {
    return handleSupabaseError(e as { code: string; message: string })
  }
})
