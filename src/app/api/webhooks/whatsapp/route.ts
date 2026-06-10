/**
 * WhatsApp webhook — handles both providers on one endpoint.
 *
 * Meta Cloud API:
 *   GET  — one-time verification handshake (hub.challenge echo).
 *   POST — `{entry: [...]}` payloads; HMAC-SHA256 over the raw body
 *          (X-Hub-Signature-256) against the org's app secret, falling back
 *          to the platform-level WHATSAPP_APP_SECRET.
 *
 * Vobiz (BSP):
 *   POST — `{event, event_id, channel_id, data}` envelopes; HMAC-SHA256 over
 *          callbackUrl+nonce (X-Vobiz-Signature-V2/V3) keyed by the account
 *          auth token. NOTE: Vobiz's inbound `data` schema isn't published —
 *          parsing is tolerant and unrecognized payloads are logged verbatim
 *          so the mapping can be corrected from the first live event.
 *
 * Must return 200 fast — both providers retry on errors (Meta disables
 * webhooks that keep failing; Vobiz retries 3x and expects 200 within 3s).
 * Inbound messages are stored immediately (idempotent on wa_message_id) and
 * the AI responder runs via the job queue; delivery receipts are applied via
 * waitUntil. Bypasses Clerk in middleware.ts; signature verification is the
 * auth.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { logger } from '@/lib/logger'
import { runInBackground } from '@/lib/api/background'
import { enqueue } from '@/lib/api/job-queue'
import { verifyMetaSignature, verifyVobizSignature } from '@/lib/whatsapp/verify'
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

// ── Vobiz payload shapes ──────────────────────────────────────────────────────

interface VobizEnvelope {
  event: string // message.received | message.sent | message.delivered | message.read | message.failed | ...
  event_id: string
  timestamp?: string
  channel_id: string
  data?: Record<string, unknown>
}

// Normalized inbound message — what both provider branches reduce to.
interface NormalizedInbound {
  waMessageId: string
  fromPhone: string // raw, any format; normalized to +E164 before storage
  body: string | null
  type: string
}

// ── GET: Meta verification handshake ──────────────────────────────────────────

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

// ── POST: messages + statuses (both providers) ────────────────────────────────

export async function POST(req: NextRequest) {
  const rawBody = await req.text()

  let payload: Record<string, unknown>
  try {
    payload = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (Array.isArray(payload.entry)) {
    return handleMetaPost(req, rawBody, payload as { entry: Array<{ changes?: Array<{ value?: MetaChangeValue }> }> })
  }

  if (typeof payload.event === 'string' && typeof payload.channel_id === 'string') {
    return handleVobizPost(req, payload as unknown as VobizEnvelope)
  }

  logger.warn('[whatsapp-webhook] unrecognized payload shape', { keys: Object.keys(payload) })
  return NextResponse.json({ received: true })
}

// ── Meta branch ───────────────────────────────────────────────────────────────

async function handleMetaPost(
  req: NextRequest,
  rawBody: string,
  payload: { entry: Array<{ changes?: Array<{ value?: MetaChangeValue }> }> },
) {
  const signature = req.headers.get('x-hub-signature-256')

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
      logger.warn('[whatsapp-webhook] meta signature verification failed', { phoneNumberId })
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
        await storeInbound(supabase, account.orgId, {
          waMessageId: msg.id,
          fromPhone: msg.from,
          body: extractMetaBody(msg),
          type: msg.type,
        })
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

function extractMetaBody(msg: MetaInboundMessage): string | null {
  if (msg.text?.body) return msg.text.body
  if (msg.button?.text) return msg.button.text
  if (msg.interactive?.button_reply?.title) return msg.interactive.button_reply.title
  if (msg.interactive?.list_reply?.title) return msg.interactive.list_reply.title
  return null
}

// ── Vobiz branch ──────────────────────────────────────────────────────────────

const VOBIZ_STATUS_EVENTS: Record<string, WhatsAppMessageStatus> = {
  'message.sent': 'sent',
  'message.delivered': 'delivered',
  'message.read': 'read',
  'message.failed': 'failed',
}

async function handleVobizPost(req: NextRequest, envelope: VobizEnvelope) {
  const supabase = createAdminClient()

  const account = await findAccountByPhoneNumberId(supabase, envelope.channel_id)
  if (!account || account.credentials.provider !== 'vobiz') {
    logger.warn('[whatsapp-webhook] no vobiz account for channel_id', { channelId: envelope.channel_id })
    return NextResponse.json({ received: true })
  }

  // Vobiz signs callbackUrl + nonce with the account auth token. Reconstruct
  // the URL as configured in their console (NEXT_PUBLIC_APP_URL based, no
  // query) rather than trusting proxy-rewritten request headers.
  const appUrl = process.env.NEXT_PUBLIC_APP_URL
  const baseUrl = appUrl
    ? `${appUrl.replace(/\/$/, '')}/api/webhooks/whatsapp`
    : `${req.nextUrl.protocol}//${req.nextUrl.host}${req.nextUrl.pathname}`

  const verified = verifyVobizSignature({
    baseUrl,
    authToken: account.credentials.accessToken,
    v2Signature: req.headers.get('x-vobiz-signature-v2'),
    v2Nonce: req.headers.get('x-vobiz-signature-v2-nonce'),
    v3Signature: req.headers.get('x-vobiz-signature-v3'),
    v3Nonce: req.headers.get('x-vobiz-signature-v3-nonce'),
  })

  if (!verified) {
    logger.warn('[whatsapp-webhook] vobiz signature verification failed', {
      channelId: envelope.channel_id,
    })
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  const data = envelope.data ?? {}

  // Delivery receipts
  const mappedStatus = VOBIZ_STATUS_EVENTS[envelope.event]
  if (mappedStatus) {
    const messageId = extractVobizMessageId(data)
    if (messageId) {
      const errMsg =
        mappedStatus === 'failed'
          ? String(data.error_code ?? data.code ?? data.error ?? data.reason ?? 'failed')
          : undefined
      runInBackground(async () => {
        await updateMessageStatus(supabase, messageId, mappedStatus, errMsg)
      })
    } else {
      logger.warn('[whatsapp-webhook] vobiz status event missing message id — raw payload follows', {
        event: envelope.event,
        data: JSON.stringify(data).slice(0, 2000),
      })
    }
    return NextResponse.json({ received: true })
  }

  // Inbound messages
  if (envelope.event === 'message.received') {
    const normalized = parseVobizInbound(envelope, data)
    if (!normalized) {
      // Schema isn't published — log the full payload so the field mapping
      // can be fixed from the first real event.
      logger.warn('[whatsapp-webhook] could not parse vobiz inbound — raw payload follows', {
        eventId: envelope.event_id,
        data: JSON.stringify(data).slice(0, 2000),
      })
      return NextResponse.json({ received: true })
    }

    try {
      await storeInbound(supabase, account.orgId, normalized)
    } catch (err) {
      logger.error('[whatsapp-webhook] vobiz inbound handling failed', err, {
        orgId: account.orgId,
        waMessageId: normalized.waMessageId,
      })
    }
  }

  return NextResponse.json({ received: true })
}

function extractVobizMessageId(data: Record<string, unknown>): string | null {
  const candidate = data.id ?? data.message_id ?? data.wamid
  return typeof candidate === 'string' && candidate ? candidate : null
}

function parseVobizInbound(envelope: VobizEnvelope, data: Record<string, unknown>): NormalizedInbound | null {
  const id = extractVobizMessageId(data) ?? envelope.event_id
  const fromRaw = data.from ?? data.sender ?? data.phone ?? data.customer_phone
  const from = typeof fromRaw === 'string' && fromRaw ? fromRaw : null

  const text = data.text as { body?: string } | string | undefined
  const message = data.message as { text?: { body?: string }; body?: string } | undefined
  const bodyRaw =
    (typeof text === 'object' ? text?.body : undefined) ??
    (typeof text === 'string' ? text : undefined) ??
    (typeof data.body === 'string' ? data.body : undefined) ??
    message?.text?.body ??
    message?.body

  if (!from) return null

  return {
    waMessageId: id,
    fromPhone: from,
    body: typeof bodyRaw === 'string' ? bodyRaw : null,
    type: typeof data.type === 'string' ? data.type : 'text',
  }
}

// ── Shared inbound path ───────────────────────────────────────────────────────

async function storeInbound(
  supabase: ReturnType<typeof createAdminClient>,
  orgId: string,
  msg: NormalizedInbound,
) {
  const waPhone = `+${msg.fromPhone.replace(/^\+/, '')}`

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
    body: msg.body ?? `[unsupported message type: ${msg.type}]`,
    wa_message_id: msg.waMessageId,
    status: 'received',
    sender: 'candidate',
  })

  // null → duplicate wa_message_id (provider retry); already stored and enqueued.
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
