import { NextResponse } from 'next/server'
import { withCapability, parseBody, handleSupabaseError } from '@/lib/api/helpers'
import { icpDraftInputSchema } from '@/lib/validations/icp'
import { updateIcpDraft } from '@/modules/ats/domain/icp'
import type { IcpDraftInput } from '@/lib/types/icp'

/** PUT — edit a draft ICP in place (drafts only). */
export const PUT = withCapability('recruiting:edit', async (req, orgId, supabase, { params }) => {
  const body = await parseBody(req, icpDraftInputSchema)
  if (body instanceof NextResponse) return body
  try {
    const icp = await updateIcpDraft(supabase, orgId, params.icpId, body as IcpDraftInput)
    return NextResponse.json({ data: icp })
  } catch (e) {
    const err = e as { code?: string; message: string }
    // "not found or not editable" is a client-visible 409, not a 500.
    if (!err.code && /not editable|not found/i.test(err.message)) {
      return NextResponse.json({ error: err.message }, { status: 409 })
    }
    return handleSupabaseError(err as { code: string; message: string })
  }
})
