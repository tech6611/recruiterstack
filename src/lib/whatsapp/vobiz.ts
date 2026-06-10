/**
 * Vobiz WhatsApp client (BSP route — used because the org's Meta business
 * account is blocked from claiming apps directly).
 *
 * API: POST https://api.vobiz.ai/v1/messaging/messages
 * Auth: X-Auth-ID + X-Auth-Token headers (token doubles as the callback HMAC
 * signing key — see verifyVobizSignature in ./verify.ts).
 * Template payloads use Meta's component format verbatim, so param handling
 * matches the Meta client.
 *
 * Docs: https://docs.vobiz.ai/whatsapp/api/send-message
 */

import { logger } from '@/lib/logger'
import type { WhatsAppCredentials } from '@/modules/crm/domain/whatsapp'
import type { WaSendResult } from './client'

const VOBIZ_BASE = 'https://api.vobiz.ai/v1'

// Vobiz error codes are strings (Meta's are numeric).
const ERROR_HINTS: Record<string, string> = {
  INVALID_NUMBER: 'Number format is invalid or not registered on WhatsApp.',
  INVALID_CHANNEL: 'WhatsApp channel does not exist or is inactive — check the Channel ID in Settings.',
  TEMPLATE_NOT_FOUND: 'Template is unapproved or missing — check the template name in Settings.',
  PARAMETER_ERROR: 'Template parameters do not match the approved template.',
  RATE_LIMIT_EXCEEDED: 'Vobiz rate limit hit — retry shortly.',
  BLOCKED: 'Recipient has blocked this business number.',
}

async function post(
  creds: WhatsAppCredentials,
  payload: Record<string, unknown>,
): Promise<WaSendResult> {
  try {
    const res = await fetch(`${VOBIZ_BASE}/messaging/messages`, {
      method: 'POST',
      headers: {
        'X-Auth-ID': creds.authId ?? '',
        'X-Auth-Token': creds.accessToken,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ channel_id: creds.phoneNumberId, ...payload }),
    })

    const json = (await res.json().catch(() => ({}))) as {
      id?: string
      error?: { code?: string; message?: string } | string
      code?: string
      message?: string
    }

    if (!res.ok || !json.id) {
      const code =
        typeof json.error === 'object' ? json.error?.code : (json.code ?? (json.error as string))
      const detail =
        (typeof json.error === 'object' ? json.error?.message : undefined) ??
        json.message ??
        `HTTP ${res.status}`
      const hint = code && ERROR_HINTS[code] ? ` ${ERROR_HINTS[code]}` : ''
      logger.warn('[whatsapp:vobiz] send failed', { code, detail })
      return { ok: false, errorCode: code, error: `${detail}.${hint}`.trim() }
    }

    return { ok: true, waMessageId: json.id }
  } catch (err) {
    logger.error('[whatsapp:vobiz] send request error', err)
    return { ok: false, error: err instanceof Error ? err.message : 'Network error calling Vobiz API' }
  }
}

/** Free-form text — only deliverable inside the 24h customer-service window. */
export async function sendVobizText(
  creds: WhatsAppCredentials,
  to: string, // E.164; Vobiz accepts the leading '+'
  body: string,
): Promise<WaSendResult> {
  return post(creds, {
    to,
    type: 'text',
    text: { body, preview_url: true },
  })
}

/** Pre-approved template — required for business-initiated conversations. */
export async function sendVobizTemplate(
  creds: WhatsAppCredentials,
  to: string,
  templateName: string,
  language: string,
  bodyParams: string[],
): Promise<WaSendResult> {
  return post(creds, {
    to,
    type: 'template',
    template: {
      name: templateName,
      language: { code: language },
      components:
        bodyParams.length > 0
          ? [
              {
                type: 'body',
                parameters: bodyParams.map((text) => ({ type: 'text', text })),
              },
            ]
          : [],
    },
  })
}
