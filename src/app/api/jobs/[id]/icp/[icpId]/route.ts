import { NextResponse } from 'next/server'
import { withCapability, parseBody, handleSupabaseError } from '@/lib/api/helpers'
import { icpDraftInputSchema, icpRecruiterCorrectionsSchema } from '@/lib/validations/icp'
import { updateIcpDraft, setIcpRecruiterCorrections } from '@/modules/ats/domain/icp'
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

/** PATCH — save the recruiter's corrections to this ICP's recruiter brief (any status:
 *  corrections are house knowledge for the NEXT regeneration, not an edit to gates). */
export const PATCH = withCapability('recruiting:edit', async (req, orgId, supabase, { params }) => {
  const body = await parseBody(req, icpRecruiterCorrectionsSchema)
  if (body instanceof NextResponse) return body
  try {
    const icp = await setIcpRecruiterCorrections(supabase, orgId, params.icpId, body.recruiter_corrections)
    return NextResponse.json({ data: icp })
  } catch (e) {
    const err = e as { code?: string; message: string }
    if (!err.code && /not found/i.test(err.message)) {
      return NextResponse.json({ error: err.message }, { status: 404 })
    }
    return handleSupabaseError(err as { code: string; message: string })
  }
})
