/**
 * GET    /api/copilot/conversations/:id — one chat with its messages.
 * PATCH  /api/copilot/conversations/:id — save { title?, messages? }.
 * DELETE /api/copilot/conversations/:id — delete the chat.
 * All scoped to the signed-in user: someone else's chat id returns 404.
 */
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/server'
import { requireOrgAndUser } from '@/lib/auth'
import {
  getConversation,
  updateConversation,
  deleteConversation,
  isMissingTable,
} from '@/modules/core/domain/copilot-conversations'

const patchSchema = z.object({
  title:    z.string().max(500).optional(),
  messages: z.array(z.unknown()).max(1000).optional(),
})

const uuid = z.string().uuid()

function fail(err: unknown, fallback: string) {
  if (isMissingTable(err)) return NextResponse.json({ error: 'history_unavailable' }, { status: 503 })
  return NextResponse.json({ error: err instanceof Error ? err.message : fallback }, { status: 500 })
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireOrgAndUser()
  if (auth instanceof NextResponse) return auth
  if (!uuid.safeParse(params.id).success) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  try {
    const data = await getConversation(createAdminClient(), auth.orgId, auth.userId, params.id)
    if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json({ data })
  } catch (err) { return fail(err, 'Failed to load chat') }
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireOrgAndUser()
  if (auth instanceof NextResponse) return auth
  if (!uuid.safeParse(params.id).success) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const parsed = patchSchema.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid chat' }, { status: 400 })
  try {
    const data = await updateConversation(createAdminClient(), auth.orgId, auth.userId, params.id, parsed.data)
    if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json({ data })
  } catch (err) { return fail(err, 'Failed to save chat') }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireOrgAndUser()
  if (auth instanceof NextResponse) return auth
  if (!uuid.safeParse(params.id).success) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  try {
    await deleteConversation(createAdminClient(), auth.orgId, auth.userId, params.id)
    return NextResponse.json({ ok: true })
  } catch (err) { return fail(err, 'Failed to delete chat') }
}
