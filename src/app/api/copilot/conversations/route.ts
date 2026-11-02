/**
 * GET  /api/copilot/conversations — the signed-in user's chats, newest first.
 * POST /api/copilot/conversations — start a chat ({ title?, messages? }).
 *
 * Until migration 157 is applied these return 503 { error: 'history_unavailable' }
 * and the chat window falls back to its single in-browser conversation.
 */
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/server'
import { requireOrgAndUser } from '@/lib/auth'
import {
  listConversations,
  createConversation,
  isMissingTable,
} from '@/modules/core/domain/copilot-conversations'

const createSchema = z.object({
  title:    z.string().max(500).optional(),
  messages: z.array(z.unknown()).max(1000).optional(),
})

const unavailable = () =>
  NextResponse.json({ error: 'history_unavailable' }, { status: 503 })

export async function GET() {
  const auth = await requireOrgAndUser()
  if (auth instanceof NextResponse) return auth
  try {
    const data = await listConversations(createAdminClient(), auth.orgId, auth.userId)
    return NextResponse.json({ data })
  } catch (err) {
    if (isMissingTable(err)) return unavailable()
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to load chats' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireOrgAndUser()
  if (auth instanceof NextResponse) return auth
  const parsed = createSchema.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid chat' }, { status: 400 })
  try {
    const data = await createConversation(createAdminClient(), auth.orgId, auth.userId, parsed.data)
    return NextResponse.json({ data }, { status: 201 })
  } catch (err) {
    if (isMissingTable(err)) return unavailable()
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to save chat' }, { status: 500 })
  }
}
