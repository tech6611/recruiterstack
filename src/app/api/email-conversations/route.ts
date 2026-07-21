import { NextResponse } from 'next/server'
import { withCapability } from '@/lib/api/helpers'
import { listConversations } from '@/modules/crm/domain/email-inbox'
import type { EmailConversationStatus } from '@/lib/types/database'

const STATUSES: EmailConversationStatus[] = ['active', 'replied', 'closed', 'archived']

// GET /api/email-conversations?status=active — Inbox conversation list.
export const GET = withCapability('recruiting:view', async (req, orgId, supabase) => {
  const url = new URL(req.url)
  const statusParam = url.searchParams.get('status')
  const status = statusParam && STATUSES.includes(statusParam as EmailConversationStatus)
    ? (statusParam as EmailConversationStatus)
    : undefined

  const conversations = await listConversations(supabase, orgId, { status })
  return NextResponse.json({ data: { conversations } })
})
