import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireOrgAndUser } from '@/lib/auth'
import { submitForApproval, ApprovalError } from '@/lib/approvals/engine'

/**
 * POST /api/req-jobs/:id/submit — kicks off approval for a Job.
 * Reuses the Phase F engine; the engine picks the right chain via
 * scope_conditions + the job target row.
 */
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireOrgAndUser()
  if (auth instanceof NextResponse) return auth
  const { orgId, userId } = auth

  const supabase = createAdminClient()
  const { data: row, error } = await supabase
    .from('jobs')
    .select('*')
    .eq('id', params.id)
    .eq('org_id', orgId)
    .single()
  if (error || !row) return NextResponse.json({ error: 'Job not found' }, { status: 404 })

  const job = row as { id: string; status: string }
  if (job.status !== 'draft') {
    return NextResponse.json({ error: `Job is in '${job.status}', not 'draft'.` }, { status: 409 })
  }

  let result
  try {
    result = await submitForApproval({
      orgId, targetType: 'job', targetId: job.id,
      target: row as unknown as Record<string, unknown>,
      requesterId: userId,
    })
  } catch (err) {
    if (err instanceof ApprovalError) return NextResponse.json({ error: err.message }, { status: err.status })
    throw err
  }

  const newStatus = result.status === 'approved' ? 'approved' : 'pending_approval'
  await supabase
    .from('jobs')
    .update({ approval_id: result.approvalId, status: newStatus })
    .eq('id', job.id)

  return NextResponse.json({ ok: true, approval_id: result.approvalId, status: result.status })
}
