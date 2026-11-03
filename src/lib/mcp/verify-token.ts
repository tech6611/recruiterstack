import { createRemoteJWKSet, jwtVerify, decodeProtectedHeader, type JWTPayload } from 'jose'
import type { AuthInfo } from '@modelcontextprotocol/server'

/**
 * Checks the OAuth access token ("access pass") that ChatGPT / Claude send to our
 * MCP server. The pass is issued by Clerk's OAuth server and is a signed JWT.
 *
 * We accept the pass only if:
 *   1. it is signed by OUR Clerk instance (signature checked against Clerk's public keys),
 *   2. it was issued by our Clerk instance (issuer) and has not expired,
 *   3. it is an OAuth access token — NOT a normal browser session token
 *      (both are signed by the same Clerk keys, so we must tell them apart),
 *   4. it names a user (`sub`) and a workspace (`org_id`, chosen on Clerk's consent screen).
 *
 * Anything else → undefined, which makes the MCP route answer 401 and point the
 * assistant at Clerk to log in. Refuse-by-default: no partial or "best effort" passes.
 *
 * Clerk's OAuth tokens carry no `aud` (checked 2026-11-03), so the audience lock is
 * replaced by the approved-client allow-list (clients.ts). Membership, role, workspace
 * switch and revocation are re-checked on EVERY tool call in guard.ts.
 */

/** Clerk's issuer URL, e.g. https://coherent-piglet-23.clerk.accounts.dev */
export function clerkIssuer(): string {
  const override = process.env.MCP_OAUTH_ISSUER
  if (override) return override.replace(/\/$/, '')
  // The publishable key is pk_(test|live)_<base64("frontend-api-domain$")>
  const pk = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? ''
  const encoded = pk.replace(/^pk_(test|live)_/, '')
  const domain = Buffer.from(encoded, 'base64').toString('utf8').replace(/\$$/, '')
  if (!domain) throw new Error('[mcp] Cannot work out the Clerk issuer: set MCP_OAUTH_ISSUER')
  return `https://${domain}`
}

let jwks: ReturnType<typeof createRemoteJWKSet> | undefined
function clerkKeys() {
  // Clerk's public signing keys; jose caches them and refreshes on key rotation.
  jwks ??= createRemoteJWKSet(new URL(`${clerkIssuer()}/.well-known/jwks.json`))
  return jwks
}

/** What our tools get to know about the caller. */
export type McpCaller = {
  userId: string
  orgId: string
  clientId: string
  scopes: string[]
}

function scopesFrom(payload: JWTPayload): string[] {
  const raw = (payload.scope ?? payload.scp) as string | string[] | undefined
  if (Array.isArray(raw)) return raw
  return typeof raw === 'string' ? raw.split(' ').filter(Boolean) : []
}

export async function verifyMcpToken(_req: Request, bearerToken?: string): Promise<AuthInfo | undefined> {
  if (!bearerToken) return undefined
  try {
    const { payload } = await jwtVerify(bearerToken, clerkKeys(), { issuer: clerkIssuer() })

    // Session tokens (from a logged-in browser) carry `sid`; OAuth access tokens
    // carry a `client_id` and/or the `at+jwt` header type. Refuse session tokens.
    const typ = decodeProtectedHeader(bearerToken).typ?.toLowerCase()
    const clientId = (payload.client_id ?? payload.azp) as string | undefined
    const isOAuthToken = typ === 'at+jwt' || (!!payload.client_id && !payload.sid)
    if (!isOAuthToken || !clientId) return undefined

    const userId = payload.sub
    const orgId = payload.org_id as string | undefined
    if (!userId || !orgId) return undefined

    const caller: McpCaller = { userId, orgId, clientId, scopes: scopesFrom(payload) }
    return {
      token: bearerToken,
      clientId,
      scopes: caller.scopes,
      expiresAt: payload.exp,
      extra: { caller },
    }
  } catch {
    // Bad signature, wrong issuer, expired, malformed → not authenticated.
    return undefined
  }
}

/** Read the verified caller inside a tool. Throws if auth somehow didn't run. */
export function callerFrom(authInfo: AuthInfo | undefined): McpCaller {
  const caller = authInfo?.extra?.caller as McpCaller | undefined
  if (!caller) throw new Error('Not authenticated')
  return caller
}
