import crypto from 'crypto'

const STATE_TTL_MS = 10 * 60 * 1000 // 10 minutes

function getSecret(): string {
  return process.env.OAUTH_STATE_SECRET || process.env.CLERK_SECRET_KEY || ''
}

/**
 * Generate a signed OAuth state token containing the orgId.
 * Format: base64url(payload) + "." + HMAC-SHA256 signature
 */
export function generateOAuthState(orgId: string): string {
  const payload = JSON.stringify({
    orgId,
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
 * Verify an OAuth state token. Returns { orgId } if valid, null otherwise.
 */
export function verifyOAuthState(state: string): { orgId: string } | null {
  const parts = state.split('.')
  if (parts.length !== 2) return null

  const [encoded, signature] = parts

  // Verify HMAC signature
  const expectedSig = crypto
    .createHmac('sha256', getSecret())
    .update(encoded)
    .digest('base64url')

  const sigBuf = Buffer.from(signature)
  const expectedBuf = Buffer.from(expectedSig)
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    return null
  }

  // Decode and check expiry
  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString())
    if (!payload.orgId || !payload.exp) return null
    if (Date.now() > payload.exp) return null
    return { orgId: payload.orgId }
  } catch {
    return null
  }
}
