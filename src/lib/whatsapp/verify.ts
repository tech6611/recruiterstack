/**
 * Meta webhook signature verification.
 *
 * Meta signs every webhook POST with the app secret over the raw body:
 * X-Hub-Signature-256: "sha256=<hex HMAC-SHA256>".
 *
 * No timestamp header is sent (unlike Slack), so there's no replay window
 * check here — replay safety comes from the UNIQUE wa_message_id constraint
 * on whatsapp_messages.
 */

import crypto from 'crypto'

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

  const a = Buffer.from(expected)
  const b = Buffer.from(args.signature)
  if (a.length !== b.length) return false
  return crypto.timingSafeEqual(a, b)
}
