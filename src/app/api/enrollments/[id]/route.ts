import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireOrg } from '@/lib/auth'

// PATCH /api/enrollments/[id] — update enrollment status (pause/resume/cancel)
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const authResult = await requireOrg()
  if (authResult instanceof NextResponse) return authResult

  let body: { status: string }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const validStatuses = ['active', 'paused', 'cancelled']
  if (!validStatuses.includes(body.status)) {
    return NextResponse.json({ error: `status must be one of: ${validStatuses.join(', ')}` }, { status: 400 })
  }

  const supabase = createAdminClient()

  const update: Record<string, unknown> = { status: body.status }
  if (body.status === 'cancelled') {
    update.completed_at = new Date().toISOString()
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.from('sequence_enrollments') as any)
    .update(update)
    .eq('id', params.id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ data })
}
