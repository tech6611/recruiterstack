import { NextResponse } from 'next/server'
import { z } from 'zod'
import { withCapability, parseBody } from '@/lib/api/helpers'
import {
  getConversationById,
  getConversationThread,
  resolveCandidateRecipient,
  updateConversation,
  markRead,
} from '@/modules/crm/domain/email-inbox'
import { sendConversationReply } from '@/lib/email/send-reply'

// GET /api/email-conversations/[id] — full thread for one conversation.
export const GET = withCapability('recruiting:view', async (_req, orgId, supabase, { params }) => {
  const conversation = await getConversationById(supabase, orgId, params.id)
  if (!conversation) {
    return NextResponse.json({ error: 'Conversation not found.' }, { status: 404 })
  }

  const messages = await getConversationThread(supabase, orgId, conversation)
  if (conversation.unread) await markRead(supabase, orgId, conversation.id)

  return NextResponse.json({ data: { conversation: { ...conversation, unread: false }, messages } })
})

const sendSchema = z.object({
  body: z.string().min(1).max(20000),
  subject: z.string().max(500).optional(),
})

// POST /api/email-conversations/[id] — recruiter sends a manual reply.
export const POST = withCapability(
  'recruiting:edit',
  async (req, orgId, supabase, { params }, _scope, userId) => {
    const parsed = await parseBody(req, sendSchema)
    if (parsed instanceof NextResponse) return parsed

    const conversation = await getConversationById(supabase, orgId, params.id)
    if (!conversation) {
      return NextResponse.json({ error: 'Conversation not found.' }, { status: 404 })
    }
    if (!conversation.candidate_id) {
      return NextResponse.json({ error: 'This conversation has no linked candidate.' }, { status: 422 })
    }

    const recipient = await resolveCandidateRecipient(supabase, orgId, conversation.candidate_id)
    if (!recipient.email) {
      return NextResponse.json({ error: 'This candidate has no email address on file.' }, { status: 422 })
    }

    const subject = parsed.subject || (conversation.subject ? `Re: ${conversation.subject.replace(/^re:\s*/i, '')}` : 'Re: your application')

    const result = await sendConversationReply(supabase, orgId, {
      conversation,
      toEmail: recipient.email,
      subject,
      bodyText: parsed.body,
      sender: userId,
    })

    return NextResponse.json(
      { data: { ok: result.ok, reason: result.reason } },
      { status: result.ok ? 200 : 422 },
    )
  },
)

const patchSchema = z.object({
  agent_enabled: z.boolean().optional(),
  status: z.enum(['active', 'replied', 'closed', 'archived']).optional(),
})

// PATCH /api/email-conversations/[id] — toggle AI responder or change status.
export const PATCH = withCapability('recruiting:edit', async (req, orgId, supabase, { params }) => {
  const parsed = await parseBody(req, patchSchema)
  if (parsed instanceof NextResponse) return parsed

  const conversation = await getConversationById(supabase, orgId, params.id)
  if (!conversation) {
    return NextResponse.json({ error: 'Conversation not found.' }, { status: 404 })
  }

  await updateConversation(supabase, orgId, conversation.id, {
    ...(parsed.agent_enabled !== undefined ? { agent_enabled: parsed.agent_enabled } : {}),
    ...(parsed.status ? { status: parsed.status } : {}),
  })

  return NextResponse.json({ data: { ok: true } })
})
