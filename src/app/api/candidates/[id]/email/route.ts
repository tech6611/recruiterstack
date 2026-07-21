import { NextResponse } from 'next/server'
import { z } from 'zod'
import { withCapability, parseBody } from '@/lib/api/helpers'
import {
  findConversationByCandidate,
  getConversationThread,
  resolveCandidateRecipient,
  updateConversation,
  markRead,
} from '@/modules/crm/domain/email-inbox'
import { sendConversationReply } from '@/lib/email/send-reply'

// GET /api/candidates/[id]/email — email conversation thread for a candidate.
export const GET = withCapability('recruiting:view', async (_req, orgId, supabase, { params }) => {
  const conversation = await findConversationByCandidate(supabase, orgId, params.id)
  if (!conversation) {
    return NextResponse.json({ data: { conversation: null, messages: [] } })
  }

  const messages = await getConversationThread(supabase, orgId, conversation)
  // Opening the thread clears the unread flag.
  if (conversation.unread) await markRead(supabase, orgId, conversation.id)

  return NextResponse.json({ data: { conversation: { ...conversation, unread: false }, messages } })
})

const sendSchema = z.object({
  body: z.string().min(1).max(20000),
  subject: z.string().max(500).optional(),
})

// POST /api/candidates/[id]/email — recruiter sends a manual reply in the thread.
export const POST = withCapability(
  'recruiting:edit',
  async (req, orgId, supabase, { params }, _scope, userId) => {
    const parsed = await parseBody(req, sendSchema)
    if (parsed instanceof NextResponse) return parsed

    const conversation = await findConversationByCandidate(supabase, orgId, params.id)
    if (!conversation) {
      return NextResponse.json(
        { error: 'No email conversation for this candidate yet. A thread starts once the candidate replies to a sequence email.' },
        { status: 404 },
      )
    }

    const recipient = await resolveCandidateRecipient(supabase, orgId, params.id)
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

const patchSchema = z.object({ agent_enabled: z.boolean() })

// PATCH /api/candidates/[id]/email — toggle the AI auto-responder for the thread.
export const PATCH = withCapability('recruiting:edit', async (req, orgId, supabase, { params }) => {
  const parsed = await parseBody(req, patchSchema)
  if (parsed instanceof NextResponse) return parsed

  const conversation = await findConversationByCandidate(supabase, orgId, params.id)
  if (!conversation) {
    return NextResponse.json({ error: 'No email conversation for this candidate.' }, { status: 404 })
  }

  await updateConversation(supabase, orgId, conversation.id, { agent_enabled: parsed.agent_enabled })
  return NextResponse.json({ data: { agent_enabled: parsed.agent_enabled } })
})
