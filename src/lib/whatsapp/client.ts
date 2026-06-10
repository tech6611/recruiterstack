/**
 * Thin wrapper over the Meta WhatsApp Business Cloud API (Graph API).
 * Returns result objects instead of throwing — agent tool callers need the
 * error string to relay to the model/user, mirroring sendOutreachEmail.
 */

import { logger } from '@/lib/logger'
import type { WhatsAppCredentials } from '@/modules/crm/domain/whatsapp'

const GRAPH_BASE = 'https://graph.facebook.com/v21.0'

export interface WaSendResult {
  ok: boolean
  waMessageId?: string
  errorCode?: number
  error?: string
}

// Meta error codes worth translating for recruiters/agents.
const ERROR_HINTS: Record<number, string> = {
  131047: 'Outside the 24-hour customer service window — only template messages can be sent.',
  131026: 'This number is not registered on WhatsApp.',
  131051: 'Unsupported message type.',
  100: 'Template name/parameters do not match an approved template.',
  190: 'WhatsApp access token expired or invalid — reconnect in Settings.',
}

async function post(
  creds: WhatsAppCredentials,
  payload: Record<string, unknown>,
): Promise<WaSendResult> {
  try {
    const res = await fetch(`${GRAPH_BASE}/${creds.phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${creds.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ messaging_product: 'whatsapp', ...payload }),
    })

    const json = (await res.json().catch(() => ({}))) as {
      messages?: Array<{ id: string }>
      error?: { code?: number; message?: string; error_data?: { details?: string } }
    }

    if (!res.ok || json.error) {
      const code = json.error?.code
      const detail = json.error?.error_data?.details ?? json.error?.message ?? `HTTP ${res.status}`
      const hint = code != null && ERROR_HINTS[code] ? ` ${ERROR_HINTS[code]}` : ''
      logger.warn('[whatsapp] send failed', { code, detail })
      return { ok: false, errorCode: code, error: `${detail}.${hint}`.trim() }
    }

    return { ok: true, waMessageId: json.messages?.[0]?.id }
  } catch (err) {
    logger.error('[whatsapp] send request error', err)
    return { ok: false, error: err instanceof Error ? err.message : 'Network error calling WhatsApp API' }
  }
}

/** Free-form text — only deliverable inside the 24h customer-service window. */
export async function sendTextMessage(
  creds: WhatsAppCredentials,
  to: string, // E.164, with or without '+'
  body: string,
): Promise<WaSendResult> {
  return post(creds, {
    to: to.replace(/^\+/, ''),
    type: 'text',
    text: { body, preview_url: true },
  })
}

/** Pre-approved template — required for business-initiated conversations. */
export async function sendTemplateMessage(
  creds: WhatsAppCredentials,
  to: string,
  templateName: string,
  language: string,
  bodyParams: string[],
): Promise<WaSendResult> {
  return post(creds, {
    to: to.replace(/^\+/, ''),
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
