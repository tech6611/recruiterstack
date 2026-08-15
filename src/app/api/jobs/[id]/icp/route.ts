import { NextResponse } from 'next/server'
import { withCapability, parseBody, handleSupabaseError } from '@/lib/api/helpers'
import { icpDraftInputSchema } from '@/lib/validations/icp'
import { getCurrentIcp, createIcpDraft } from '@/modules/ats/domain/icp'
import type { IcpDraftInput } from '@/lib/types/icp'

/** GET — the live ICP for this job (approved, else newest draft), or null. */
export const GET = withCapability('recruiting:view', async (_req, orgId, supabase, { params }) => {
  try {
    const icp = await getCurrentIcp(supabase, orgId, params.id)
    return NextResponse.json({ data: icp })
  } catch (e) {
    return handleSupabaseError(e as { code: string; message: string })
  }
})

/** POST — create a new draft ICP for this job (manual authoring; AI seeding
 *  arrives in Slice 1b). */
export const POST = withCapability(
  'recruiting:edit',
  async (req, orgId, supabase, { params }, _scope, userId) => {
    const body = await parseBody(req, icpDraftInputSchema)
    if (body instanceof NextResponse) return body
    try {
      const icp = await createIcpDraft(supabase, orgId, params.id, body as IcpDraftInput, {
        createdBy: userId,
      })
      return NextResponse.json({ data: icp }, { status: 201 })
    } catch (e) {
      return handleSupabaseError(e as { code: string; message: string })
    }
  },
)
