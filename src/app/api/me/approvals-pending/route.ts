import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireOrgAndUser } from '@/lib/auth'
import type { TimeOffRequest } from '@/lib/types/database'

interface PendingDecision {
  request: TimeOffRequest
  requester: { name: string | null; email: string | null } | null
  employee_id: string
}

// GET /api/me/approvals-pending — time-off requests awaiting MY decision
// (i.e. where I'm the assigned approver_user_id). Enriched with the requester's
// person info so the UI doesn't need a second round-trip.
export async function GET() {
  const authResult = await requireOrgAndUser()
  if (authResult instanceof NextResponse) return authResult
  const { orgId, userId } = authResult

  const supabase = createAdminClient()
  try {
    const { data: requests, error: reqErr } = await supabase
      .from('time_off_requests')
      .select('*')
      .eq('org_id', orgId)
      .eq('approver_user_id', userId)
      .eq('status', 'pending')
      .order('requested_at', { ascending: true })

    if (reqErr) throw reqErr
    const reqs = (requests ?? []) as TimeOffRequest[]

    if (reqs.length === 0) {
      return NextResponse.json({ data: [] })
    }

    // Enrich with each requester's person info — one round-trip via employee_profiles → people.
    const employeeIds = Array.from(new Set(reqs.map(r => r.employee_id)))
    const { data: emps } = await supabase
      .from('employee_profiles')
      .select('id, person:people(name, email)')
      .in('id', employeeIds)

    const personByEmp = new Map(
      (emps ?? []).map(e => {
        const row = e as unknown as { id: string; person: { name: string; email: string } | null }
        return [row.id, row.person]
      }),
    )

    const data: PendingDecision[] = reqs.map(r => ({
      request:     r,
      requester:   personByEmp.get(r.employee_id) ?? null,
      employee_id: r.employee_id,
    }))

    return NextResponse.json({ data })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch pending approvals' },
      { status: 500 },
    )
  }
}
