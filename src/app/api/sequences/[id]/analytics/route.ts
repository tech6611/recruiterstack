import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireOrg } from '@/lib/auth'

// GET /api/sequences/[id]/analytics — sequence performance analytics
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const authResult = await requireOrg()
  if (authResult instanceof NextResponse) return authResult
  const { orgId } = authResult

  const supabase = createAdminClient()

  // Verify sequence belongs to org
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: seq } = await (supabase.from('sequences') as any)
    .select('id, name')
    .eq('id', params.id)
    .eq('org_id', orgId)
    .single()

  if (!seq) return NextResponse.json({ error: 'Sequence not found' }, { status: 404 })

  // Fetch all enrollments and emails
  const [enrollmentsRes, emailsRes, stagesRes] = await Promise.all([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase.from('sequence_enrollments') as any)
      .select('id, status')
      .eq('sequence_id', params.id),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase.from('sequence_emails') as any)
      .select('stage_id, status, open_count, click_count')
      .in('enrollment_id',
        // Subquery: all enrollment IDs for this sequence
        // We'll filter after fetch since Supabase doesn't support subqueries easily
        []
      ),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase.from('sequence_stages') as any)
      .select('id, order_index, subject, delay_days')
      .eq('sequence_id', params.id)
      .order('order_index', { ascending: true }),
  ])

  const enrollments = enrollmentsRes.data ?? []
  const stages = stagesRes.data ?? []

  // Get enrollment IDs then fetch emails
  const enrollmentIds = enrollments.map((e: { id: string }) => e.id)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: emails } = enrollmentIds.length > 0
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ? await (supabase.from('sequence_emails') as any)
        .select('stage_id, status, open_count, click_count')
        .in('enrollment_id', enrollmentIds)
    : { data: [] }

  // Compute enrollment status breakdown
  const enrollmentStatuses: Record<string, number> = {}
  for (const e of enrollments) {
    enrollmentStatuses[e.status] = (enrollmentStatuses[e.status] ?? 0) + 1
  }

  // Compute overall stats
  const allEmails = emails ?? []
  const overall = {
    total_sent: allEmails.filter((e: { status: string }) => e.status !== 'queued' && e.status !== 'failed').length,
    total_opened: allEmails.filter((e: { status: string }) => ['opened', 'clicked', 'replied'].includes(e.status)).length,
    total_replied: allEmails.filter((e: { status: string }) => e.status === 'replied').length,
    total_bounced: allEmails.filter((e: { status: string }) => e.status === 'bounced').length,
  }

  // Per-stage stats
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const stageAnalytics = stages.map((s: any) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stageEmails = allEmails.filter((e: any) => e.stage_id === s.id)
    return {
      stage_id: s.id,
      order_index: s.order_index,
      subject: s.subject,
      delay_days: s.delay_days,
      sent: stageEmails.filter((e: { status: string }) => e.status !== 'queued' && e.status !== 'failed').length,
      delivered: stageEmails.filter((e: { status: string }) => !['queued', 'failed', 'bounced'].includes(e.status)).length,
      opened: stageEmails.filter((e: { status: string }) => ['opened', 'clicked', 'replied'].includes(e.status)).length,
      clicked: stageEmails.filter((e: { status: string }) => ['clicked', 'replied'].includes(e.status)).length,
      replied: stageEmails.filter((e: { status: string }) => e.status === 'replied').length,
      bounced: stageEmails.filter((e: { status: string }) => e.status === 'bounced').length,
    }
  })

  return NextResponse.json({
    data: {
      sequence_id: seq.id,
      sequence_name: seq.name,
      total_enrollments: enrollments.length,
      enrollment_statuses: enrollmentStatuses,
      overall,
      stages: stageAnalytics,
    },
  })
}
