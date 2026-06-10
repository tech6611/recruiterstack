/**
 * Webhook signature verification for both WhatsApp providers.
 *
 * Meta signs every webhook POST with the app secret over the raw body:
 * X-Hub-Signature-256: "sha256=<hex HMAC-SHA256>".
 *
 * Vobiz signs the callback URL + a per-request nonce (NOT the body) with the
 * account auth token: X-Vobiz-Signature-V2 = base64(HMAC-SHA256(baseUrl +
 * nonce)), V3 uses baseUrl + "." + nonce. Docs:
 * https://docs.vobiz.ai/concepts/validating-callbacks
 *
 * Neither sends a timestamp header, so there's no replay window check here —
 * replay safety comes from the UNIQUE wa_message_id constraint on
 * whatsapp_messages.
 */

import crypto from 'crypto'

function timingSafeEqual(expected: string, actual: string): boolean {
  const a = Buffer.from(expected)
  const b = Buffer.from(actual)
  if (a.length !== b.length) return false
  return crypto.timingSafeEqual(a, b)
}

export function verifyMetaSignature(args: {
  rawBody: string
  signature: string | null
  appSecret: string | null | undefined
}): boolean {
  if (!args.appSecret || !args.signature) return false

  const expected = `sha256=${crypto
    .createHmac('sha256', args.appSecret)
    .update(args.rawBody)
    .digest('hex')}`

  return timingSafeEqual(expected, args.signature)
}

/**
 * Vobiz callback verification. Accepts either signature version; the signing
 * key is the account's auth token (X-Auth-Token). baseUrl must match the
 * callback URL configured in the Vobiz console, query string stripped.
 */
export function verifyVobizSignature(args: {
  baseUrl: string
  authToken: string | null | undefined
  v2Signature?: string | null
  v2Nonce?: string | null
  v3Signature?: string | null
  v3Nonce?: string | null
}): boolean {
  if (!args.authToken) return false

  if (args.v3Signature && args.v3Nonce) {
    const expected = crypto
      .createHmac('sha256', args.authToken)
      .update(`${args.baseUrl}.${args.v3Nonce}`)
      .digest('base64')
    if (timingSafeEqual(expected, args.v3Signature)) return true
  }

  if (args.v2Signature && args.v2Nonce) {
    const expected = crypto
      .createHmac('sha256', args.authToken)
      .update(`${args.baseUrl}${args.v2Nonce}`)
      .digest('base64')
    if (timingSafeEqual(expected, args.v2Signature)) return true
  }

  return false
}
