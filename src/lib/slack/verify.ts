/**
 * Slack request signature verification.
 *
 * Slack signs every request with the team's signing secret + a timestamp.
 * Spec: v0:{timestamp}:{raw_body} → HMAC-SHA256 → "v0=<hex>".
 *
 * We reject if:
 *  - the timestamp is more than 5 minutes off (replay protection)
 *  - the signature doesn't match (timing-safe compare)
 *  - SLACK_SIGNING_SECRET isn't configured
 */

import crypto from 'crypto'

const FIVE_MINUTES = 5 * 60

export function verifySlackSignature(args: {
  rawBody:    string
  timestamp:  string | null
  signature:  string | null
}): boolean {
  const secret = process.env.SLACK_SIGNING_SECRET
  if (!secret || !args.timestamp || !args.signature) return false

  const ts = parseInt(args.timestamp, 10)
  if (!Number.isFinite(ts)) return false
  if (Math.abs(Math.floor(Date.now() / 1000) - ts) > FIVE_MINUTES) return false

  const base = `v0:${args.timestamp}:${args.rawBody}`
  const expected = `v0=${crypto.createHmac('sha256', secret).update(base).digest('hex')}`

  const a = Buffer.from(expected)
  const b = Buffer.from(args.signature)
  if (a.length !== b.length) return false
  return crypto.timingSafeEqual(a, b)
}
