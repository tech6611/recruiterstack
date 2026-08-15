import { NextResponse } from 'next/server'
import { z } from 'zod'
import { withCapability, parseBody, handleSupabaseError } from '@/lib/api/helpers'
import { enqueueFirstStage } from '@/modules/crm/domain/enroll'

// Tables not yet in the generated Supabase types.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LooseSb = any

const bodySchema = z.object({
  action: z.enum(['approve', 'reject']),
  // Optional edits to the personalized first message, applied before approving.
  subject: z.string().max(300).optional(),
  body: z.string().max(20000).optional(),
})

/** POST — approve or reject a held (awaiting_review) enrollment (8b-2).
 *  approve → optionally save edits to the first message, then schedule the first send.
 *  reject  → cancel the enrollment; nothing is sent. */
export const POST = withCapability('recruiting:edit', async (req, orgId, supabase, { params }) => {
  const body = await parseBody(req, bodySchema)
  if (body instanceof NextResponse) return body

  try {
    const { data: enr, error: getErr } = await (supabase as unknown as LooseSb)
      .from('sequence_enrollments')
      .select('id, sequence_id, awaiting_review')
      .eq('org_id', orgId)
      .eq('id', params.id)
      .single()
    if (getErr || !enr) {
      return NextResponse.json({ error: 'Enrollment not found.' }, { status: 404 })
    }
    if (!enr.awaiting_review) {
      return NextResponse.json({ error: 'This enrollment is not awaiting review.' }, { status: 409 })
    }

    if (body.action === 'reject') {
      const { error } = await (supabase as unknown as LooseSb)
        .from('sequence_enrollments')
        .update({ awaiting_review: false, status: 'cancelled' })
        .eq('id', params.id)
        .eq('org_id', orgId)
      if (error) return handleSupabaseError(error)
      return NextResponse.json({ data: { action: 'reject', enrollment_id: params.id } })
    }

    // approve — persist any edits to the first message, release the hold, schedule send.
    const patch: Record<string, unknown> = { awaiting_review: false }
    if (typeof body.subject === 'string') patch.intro_subject = body.subject
    if (typeof body.body === 'string') patch.intro_body = body.body

    const { error } = await (supabase as unknown as LooseSb)
      .from('sequence_enrollments')
      .update(patch)
      .eq('id', params.id)
      .eq('org_id', orgId)
    if (error) return handleSupabaseError(error)

    await enqueueFirstStage(supabase, { orgId, sequenceId: enr.sequence_id, enrollmentId: params.id })
    return NextResponse.json({ data: { action: 'approve', enrollment_id: params.id } })
  } catch (e) {
    return handleSupabaseError(e as { code: string; message: string })
  }
})
