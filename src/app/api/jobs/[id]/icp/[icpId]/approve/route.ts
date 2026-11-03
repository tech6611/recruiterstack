import { NextResponse } from 'next/server'
import { withCapability, handleSupabaseError } from '@/lib/api/helpers'
import { approveIcpForJob } from '@/modules/ats/domain/icp-actions'

/** POST — promote a draft ICP to the live version, then sync the down-projected
 *  rubric back to the job so the board + Sifter read the approved ICP. Logic
 *  shared with the copilot's approve_icp tool (modules/ats/domain/icp-actions). */
export const POST = withCapability(
  'recruiting:edit',
  async (_req, orgId, supabase, { params }, _scope, userId) => {
    try {
      const icp = await approveIcpForJob(supabase as never, orgId, params.id, params.icpId, userId)
      return NextResponse.json({ data: icp })
    } catch (e) {
      return handleSupabaseError(e as { code: string; message: string })
    }
  },
)
