import crypto from 'crypto'

const STATE_TTL_MS = 10 * 60 * 1000 // 10 minutes

function getSecret(): string {
  return process.env.OAUTH_STATE_SECRET || process.env.CLERK_SECRET_KEY || ''
}

export interface OAuthStatePayload {
  orgId: string
  userId?: string                    // optional — Slack doesn't need per-user binding
}

/**
 * Generate a signed OAuth state token containing orgId and (optionally) userId.
 * userId is REQUIRED for per-member integrations (Google/MS/Zoom); it's the
 * binding between the callback and which user's tokens to write.
 * Slack callbacks pass orgId only — the install is org-wide.
 *
 * Format: base64url(payload) + "." + HMAC-SHA256 signature
 */
export function generateOAuthState(params: OAuthStatePayload): string {
  const payload = JSON.stringify({
    orgId: params.orgId,
    userId: params.userId,
    nonce: crypto.randomBytes(16).toString('hex'),
    exp: Date.now() + STATE_TTL_MS,
  })

  const encoded = Buffer.from(payload).toString('base64url')
  const signature = crypto
    .createHmac('sha256', getSecret())
    .update(encoded)
    .digest('base64url')

  return `${encoded}.${signature}`
}

/**
 * Verify an OAuth state token. Returns { orgId, userId? } if valid, null otherwise.
 * Callers that need userId must check for its presence themselves.
 */
export function verifyOAuthState(state: string): OAuthStatePayload | null {
  const parts = state.split('.')
  if (parts.length !== 2) return null

  const [encoded, signature] = parts

  const expectedSig = crypto
    .createHmac('sha256', getSecret())
    .update(encoded)
    .digest('base64url')

  const sigBuf = Buffer.from(signature)
  const expectedBuf = Buffer.from(expectedSig)
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    return null
  }

  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString())
    if (!payload.orgId || !payload.exp) return null
    if (Date.now() > payload.exp) return null
    return { orgId: payload.orgId, userId: payload.userId }
  } catch {
    return null
  }
}
