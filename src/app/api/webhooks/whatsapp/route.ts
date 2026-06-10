/**
 * Meta WhatsApp Cloud API webhook.
 *
 * GET  — Meta's one-time verification handshake (hub.challenge echo).
 * POST — message + delivery-status events. Signature-verified (HMAC-SHA256
 *        over the raw body, X-Hub-Signature-256) against the owning org's
 *        app secret, falling back to the platform-level WHATSAPP_APP_SECRET.
 *
 * Must return 200 fast — Meta retries on errors and disables webhooks that
 * keep failing. Inbound messages are stored immediately (idempotent on
 * wa_message_id) and the AI responder runs via the job queue; delivery
 * receipts are applied via waitUntil.
 *
 * Bypasses Clerk in middleware.ts; signature verification is the auth.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { logger } from '@/lib/logger'
import { runInBackground } from '@/lib/api/background'
import { enqueue } from '@/lib/api/job-queue'
import { verifyMetaSignature } from '@/lib/whatsapp/verify'
import {
  findAccountByPhoneNumberId,
  findOrCreateConversation,
  matchPersonByWaPhone,
  recordMessage,
  updateConversation,
  updateMessageStatus,
} from '@/modules/crm/domain/whatsapp'
import type { WhatsAppMessageStatus } from '@/lib/types/database'

// ── Meta payload shapes (the slices we consume) ───────────────────────────────

interface MetaInboundMessage {
  id: string // wamid.*
  from: string // wa_id — E.164 digits, no '+'
  timestamp: string
  type: string
  text?: { body: string }
  button?: { text: string }
  interactive?: { button_reply?: { title: string }; list_reply?: { title: string } }
}

interface MetaStatus {
  id: string // wamid.* of the outbound message
  status: 'sent' | 'delivered' | 'read' | 'failed'
  errors?: Array<{ code: number; title?: string; message?: string }>
}

interface MetaChangeValue {
  metadata?: { phone_number_id?: string }
  messages?: MetaInboundMessage[]
  statuses?: MetaStatus[]
}

// ── GET: verification handshake ───────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams
  const mode = params.get('hub.mode')
  const token = params.get('hub.verify_token')
  const challenge = params.get('hub.challenge')

  const expected = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN
  if (mode === 'subscribe' && expected && token === expected && challenge) {
    return new NextResponse(challenge, { status: 200 })
  }

  return NextResponse.json({ error: 'Verification failed' }, { status: 403 })
}

// ── POST: messages + statuses ─────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const rawBody = await req.text()
  const signature = req.headers.get('x-hub-signature-256')

  let payload: { entry?: Array<{ changes?: Array<{ value?: MetaChangeValue }> }> }
  try {
    payload = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const values = (payload.entry ?? [])
    .flatMap((e) => e.changes ?? [])
    .map((c) => c.value)
    .filter((v): v is MetaChangeValue => !!v)

  if (values.length === 0) return NextResponse.json({ received: true })

  const supabase = createAdminClient()

  for (const value of values) {
    const phoneNumberId = value.metadata?.phone_number_id
    if (!phoneNumberId) continue

    const account = await findAccountByPhoneNumberId(supabase, phoneNumberId)
    if (!account) {
      logger.warn('[whatsapp-webhook] no account for phone_number_id', { phoneNumberId })
      continue
    }

    // Verify against the org's app secret; platform secret as fallback.
    // (Resolution before verification is fine — mismatches are discarded.)
    const verified =
      verifyMetaSignature({ rawBody, signature, appSecret: account.credentials.appSecret }) ||
      verifyMetaSignature({ rawBody, signature, appSecret: process.env.WHATSAPP_APP_SECRET })

    if (!verified) {
      logger.warn('[whatsapp-webhook] signature verification failed', { phoneNumberId })
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
    }

    // Delivery receipts — cheap, apply in the background.
    if (value.statuses && value.statuses.length > 0) {
      const statuses = value.statuses
      runInBackground(async () => {
        for (const s of statuses) {
          const errMsg = s.errors?.[0]
            ? `${s.errors[0].code}: ${s.errors[0].message ?? s.errors[0].title ?? ''}`
            : undefined
          await updateMessageStatus(supabase, s.id, s.status as WhatsAppMessageStatus, errMsg)
        }
      })
    }

    // Inbound messages — store now, respond via the job queue.
    for (const msg of value.messages ?? []) {
      try {
        await handleInbound(supabase, account.orgId, msg)
      } catch (err) {
        logger.error('[whatsapp-webhook] inbound handling failed', err, {
          orgId: account.orgId,
          waMessageId: msg.id,
        })
      }
    }
  }

  return NextResponse.json({ received: true })
}

function extractBody(msg: MetaInboundMessage): string | null {
  if (msg.text?.body) return msg.text.body
  if (msg.button?.text) return msg.button.text
  if (msg.interactive?.button_reply?.title) return msg.interactive.button_reply.title
  if (msg.interactive?.list_reply?.title) return msg.interactive.list_reply.title
  return null
}

async function handleInbound(
  supabase: ReturnType<typeof createAdminClient>,
  orgId: string,
  msg: MetaInboundMessage,
) {
  const waPhone = `+${msg.from.replace(/^\+/, '')}`

  const matched = await matchPersonByWaPhone(supabase, orgId, waPhone)

  const conversation = await findOrCreateConversation(supabase, orgId, {
    waPhone,
    personId: matched?.personId ?? null,
    candidateId: matched?.candidateId ?? null,
  })

  const stored = await recordMessage(supabase, {
    conversation_id: conversation.id,
    org_id: orgId,
    direction: 'inbound',
    body: extractBody(msg) ?? `[unsupported message type: ${msg.type}]`,
    wa_message_id: msg.id,
    status: 'received',
    sender: 'candidate',
  })

  // null → duplicate wa_message_id (Meta retry); already stored and enqueued.
  if (!stored) return

  await updateConversation(supabase, orgId, conversation.id, {
    last_inbound_at: new Date().toISOString(),
  })

  await enqueue({
    orgId,
    jobType: 'whatsapp_inbound',
    payload: { messageId: stored.id, conversationId: conversation.id },
  })

  // Kick the queue worker so the reply doesn't wait for the next cron tick.
  const appUrl = process.env.NEXT_PUBLIC_APP_URL
  const cronSecret = process.env.CRON_SECRET
  if (appUrl && cronSecret) {
    runInBackground(async () => {
      await fetch(`${appUrl}/api/queue/process`, {
        method: 'POST',
        headers: { authorization: `Bearer ${cronSecret}` },
      })
    })
  }
}
