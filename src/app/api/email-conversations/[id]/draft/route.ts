import { NextResponse } from 'next/server'
import { withCapability } from '@/lib/api/helpers'
import { getConversationById, getConversationThread } from '@/modules/crm/domain/email-inbox'
import { composeReply } from '@/lib/email/compose-reply'

// POST /api/email-conversations/[id]/draft — AI-suggested reply for the recruiter
// to review (the automatic auto-send path lives in the Django inbound webhook;
// this is the manual "suggest a reply" helper in the UI).
export const POST = withCapability('recruiting:edit', async (_req, orgId, supabase, { params }) => {
  const conversation = await getConversationById(supabase, orgId, params.id)
  if (!conversation) {
    return NextResponse.json({ error: 'Conversation not found.' }, { status: 404 })
  }

  const thread = await getConversationThread(supabase, orgId, conversation)
  if (thread.length === 0) {
    return NextResponse.json({ error: 'Nothing to reply to yet.' }, { status: 422 })
  }

  const ctx = (conversation.context ?? {}) as { candidate_name?: string; job_title?: string }
  const draft = await composeReply({
    candidateName: ctx.candidate_name ?? null,
    jobTitle: ctx.job_title ?? null,
    thread,
  })

  return NextResponse.json({ data: { draft } })
})
