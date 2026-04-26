import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireOrgAndUser } from '@/lib/auth'
import { parseBody } from '@/lib/api/helpers'
import { decideOnStep, ApprovalError } from '@/lib/approvals/engine'

const decideSchema = z.object({
  decision: z.enum(['approved', 'rejected']),
  comment:  z.string().trim().max(5000).optional().nullable(),
}).refine(
  d => d.decision === 'approved' || (d.comment != null && d.comment.length >= 20),
  { message: 'Reject comment must be at least 20 chars', path: ['comment'] },
)

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string; step_id: string } },
) {
  const auth = await requireOrgAndUser()
  if (auth instanceof NextResponse) return auth

  const body = await parseBody(req, decideSchema)
  if (body instanceof NextResponse) return body

  try {
    const result = await decideOnStep({
      approvalId: params.id,
      stepId:     params.step_id,
      userId:     auth.userId,
      decision:   body.decision,
      comment:    body.comment ?? null,
    })
    return NextResponse.json({ ok: true, status: result.status })
  } catch (err) {
    if (err instanceof ApprovalError) return NextResponse.json({ error: err.message }, { status: err.status })
    throw err
  }
}
