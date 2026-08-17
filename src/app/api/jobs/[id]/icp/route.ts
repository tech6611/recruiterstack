import { NextResponse } from 'next/server'
import { withCapability, parseBody, handleSupabaseError } from '@/lib/api/helpers'
import { icpDraftInputSchema } from '@/lib/validations/icp'
import { getCurrentIcp, getLatestIcp, createIcpDraft } from '@/modules/ats/domain/icp'
import type { IcpDraftInput } from '@/lib/types/icp'

/** GET — the ICP for this job. Default = the live/approved one (else newest draft).
 *  `?latest=1` = the newest version regardless of status, for the editor (so a
 *  freshly-(re)generated draft + its reasoning survives a refresh). */
export const GET = withCapability('recruiting:view', async (req, orgId, supabase, { params }) => {
  try {
    const latest = new URL(req.url).searchParams.get('latest') === '1'
    const icp = latest
      ? await getLatestIcp(supabase, orgId, params.id)
      : await getCurrentIcp(supabase, orgId, params.id)
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
