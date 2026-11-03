/**
 * POST /api/copilot/approve
 *
 * The recruiter's click on an exact-approval card (see lib/copilot/approvals).
 * Body: { approval_id: string, decision: 'approve' | 'cancel' }
 *
 * approve → atomically claims the held batch (pending → executing; same org +
 *           user, not expired, single use), runs exactly the stored tool calls
 *           with the recruiter's CURRENT permissions, and returns each result.
 * cancel  → marks the batch cancelled so it can never run.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireOrgAndUser } from '@/lib/auth'
import { getPermissionSet } from '@/lib/rbac'
import { checkAuthRateLimit } from '@/lib/api/rate-limit'
import { executeTool } from '@/lib/copilot-tools'
import { cancelPendingBatch, claimPendingBatch, finishPendingBatch } from '@/lib/copilot/approvals'

export const maxDuration = 60

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(request: NextRequest) {
  const authResult = await requireOrgAndUser()
  if (authResult instanceof NextResponse) return authResult
  const { orgId, userId } = authResult

  const rateLimited = await checkAuthRateLimit(orgId, { maxRequests: 20, window: '60 s' })
  if (rateLimited) return rateLimited

  let approvalId = ''
  let decision = ''
  try {
    const body = await request.json()
    approvalId = typeof body.approval_id === 'string' ? body.approval_id : ''
    decision = typeof body.decision === 'string' ? body.decision : ''
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  if (!UUID_RE.test(approvalId) || !['approve', 'cancel'].includes(decision)) {
    return NextResponse.json({ error: 'approval_id and decision (approve | cancel) are required' }, { status: 400 })
  }

  const supabase = createAdminClient()

  if (decision === 'cancel') {
    const ok = await cancelPendingBatch(supabase, approvalId, orgId, userId)
    return NextResponse.json({ cancelled: ok })
  }

  const claimed = await claimPendingBatch(supabase, approvalId, orgId, userId)
  if ('error' in claimed) return NextResponse.json({ error: claimed.error }, { status: 409 })

  // Permissions are re-checked now, not when the card was made.
  const capabilities = await getPermissionSet(supabase, orgId, userId)
  const results: { preview: string; result: string }[] = []
  for (const action of claimed.actions) {
    let result: string
    try {
      result = await executeTool(action.tool, action.args ?? {}, orgId, supabase, capabilities, userId)
    } catch (err) {
      result = `Error: ${err instanceof Error ? err.message : 'unknown error'}`
    }
    results.push({ preview: action.preview, result })
  }
  await finishPendingBatch(supabase, approvalId, results)

  return NextResponse.json({ results })
}
