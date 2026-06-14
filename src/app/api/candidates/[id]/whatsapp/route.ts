import { NextResponse } from 'next/server'
import { z } from 'zod'
import { withCapability, parseBody } from '@/lib/api/helpers'
import {
  findConversationByCandidate,
  getConversationHistory,
  isWithinServiceWindow,
  updateConversation,
} from '@/modules/crm/domain/whatsapp'
import { sendWhatsApp } from '@/lib/whatsapp/send'

// GET /api/candidates/[id]/whatsapp — conversation thread for a candidate.
export const GET = withCapability('recruiting:view', async (_req, orgId, supabase, { params }) => {
  const conversation = await findConversationByCandidate(supabase, orgId, params.id)
  if (!conversation) {
    return NextResponse.json({ data: { conversation: null, messages: [], within_window: false } })
  }

  const messages = await getConversationHistory(supabase, orgId, conversation.id, 100)
  return NextResponse.json({
    data: {
      conversation,
      messages,
      within_window: isWithinServiceWindow(conversation),
    },
  })
})

const sendSchema = z.object({ body: z.string().min(1).max(4000) })

// POST /api/candidates/[id]/whatsapp — recruiter sends a message in the thread.
export const POST = withCapability('recruiting:edit', async (req, orgId, supabase, { params }, _scope, userId) => {
  const parsed = await parseBody(req, sendSchema)
  if (parsed instanceof NextResponse) return parsed

  const result = await sendWhatsApp({
    supabase,
    orgId,
    candidateId: params.id,
    body: parsed.body,
    sender: userId,
  })

  return NextResponse.json(
    { data: { ok: result.ok, message: result.message } },
    { status: result.ok ? 200 : 422 },
  )
})

const patchSchema = z.object({ agent_enabled: z.boolean() })

// PATCH /api/candidates/[id]/whatsapp — toggle the AI responder for the thread.
export const PATCH = withCapability('recruiting:edit', async (req, orgId, supabase, { params }) => {
  const parsed = await parseBody(req, patchSchema)
  if (parsed instanceof NextResponse) return parsed

  const conversation = await findConversationByCandidate(supabase, orgId, params.id)
  if (!conversation) {
    return NextResponse.json({ error: 'No WhatsApp conversation for this candidate.' }, { status: 404 })
  }

  await updateConversation(supabase, orgId, conversation.id, {
    agent_enabled: parsed.agent_enabled,
    // Re-enabling the responder reactivates an escalated thread.
    ...(parsed.agent_enabled && conversation.status === 'escalated' ? { status: 'active' as const } : {}),
  })

  return NextResponse.json({ data: { agent_enabled: parsed.agent_enabled } })
})
