import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/server'
import { requireOrgAndUser } from '@/lib/auth'
import { getViewerScope, assertCapability } from '@/lib/rbac'
import { parseBody } from '@/lib/api/helpers'
import { closeOpening, OPENING_CLOSE_REASONS } from '@/lib/openings/seats'

const schema = z.object({
  reason: z.enum(OPENING_CLOSE_REASONS.map(r => r.value) as [string, ...string[]]),
  note: z.string().trim().max(2000).optional().nullable(),
})

/** POST /api/openings/:id/close — close a seat without a hire. */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireOrgAndUser()
  if (auth instanceof NextResponse) return auth
  const body = await parseBody(req, schema)
  if (body instanceof NextResponse) return body
  const supabase = createAdminClient()
  const denied = assertCapability(await getViewerScope(supabase, auth.orgId, auth.userId), 'openings:edit')
  if (denied) return denied
  const r = await closeOpening(supabase, auth.orgId, params.id, body.reason as never, body.note ?? null, auth.userId)
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status })
  return NextResponse.json({ ok: true, status: 'closed' })
}
