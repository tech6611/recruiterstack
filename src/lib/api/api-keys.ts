import { NextRequest, NextResponse } from 'next/server'
import { createHash, randomBytes } from 'crypto'
import * as Sentry from '@sentry/nextjs'
import { createAdminClient } from '@/lib/supabase/server'
import { checkAuthRateLimit } from '@/lib/api/rate-limit'
import { logger } from '@/lib/logger'

// Human-readable, non-secret marker so a leaked key is recognisable in logs/
// git history and can be scanned for. The rest of the token is the secret.
const KEY_PREFIX = 'rs_live_'
// How many chars after the prefix we keep in `key_prefix` for UI display.
const DISPLAY_TAIL = 6

/**
 * Mint a new API key. Returns the raw token (shown to the user ONCE), its
 * SHA-256 hash (the only thing we store), and a short non-secret prefix for
 * display. The raw token is never persisted.
 */
export function generateApiKey(): { raw: string; hash: string; prefix: string } {
  // 24 random bytes → 32 url-safe chars. Ample entropy; no ambiguous symbols.
  const secret = randomBytes(24).toString('base64url')
  const raw = `${KEY_PREFIX}${secret}`
  return {
    raw,
    hash: hashApiKey(raw),
    prefix: raw.slice(0, KEY_PREFIX.length + DISPLAY_TAIL),
  }
}

/** SHA-256 hex digest of a raw key — the value compared against `api_keys.key_hash`. */
export function hashApiKey(raw: string): string {
  return createHash('sha256').update(raw).digest('hex')
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClient = ReturnType<typeof createAdminClient>

type ApiKeyHandler = (
  req: NextRequest,
  orgId: string,
  supabase: SupabaseClient,
  ctx: { params: Record<string, string> },
) => Promise<NextResponse | Response>

/**
 * Wraps a route handler with API-key auth — the extension's equivalent of
 * `withOrg`. Reads a `Authorization: Bearer <key>` header, resolves the org
 * from the (hashed) key, rate-limits per key, stamps last-used, and hands the
 * handler an admin Supabase client already scoped by the returned orgId.
 *
 * These routes are registered as Clerk-bypassed in middleware.ts, exactly like
 * /api/sequences/process (which uses CRON_SECRET). Auth lives here, in the route.
 */
export function withApiKey(handler: ApiKeyHandler) {
  return async (req: NextRequest, ctx?: { params: Record<string, string> }) => {
    const start = Date.now()
    const method = req.method
    const path = new URL(req.url).pathname

    try {
      const header = req.headers.get('authorization') ?? ''
      const token = header.startsWith('Bearer ') ? header.slice(7).trim() : ''
      if (!token) {
        return NextResponse.json({ error: 'Missing API key' }, { status: 401 })
      }

      const supabase = createAdminClient()
      const hash = hashApiKey(token)

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: key } = await (supabase as any).from('api_keys')
        .select('id, org_id, revoked_at')
        .eq('key_hash', hash)
        .maybeSingle()

      if (!key || key.revoked_at) {
        return NextResponse.json({ error: 'Invalid or revoked API key' }, { status: 401 })
      }

      const orgId = key.org_id as string

      // Rate limit per key (default 30/min) so a leaked key can't hammer us.
      const limited = await checkAuthRateLimit(`apikey:${key.id}`)
      if (limited) return limited

      Sentry.setTag('org_id', orgId)

      // Best-effort "last used" stamp; a failure here must not fail the request.
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any).from('api_keys')
          .update({ last_used_at: new Date().toISOString() })
          .eq('id', key.id)
      } catch {
        /* last-used is advisory only */
      }

      const response = await handler(req, orgId, supabase, ctx ?? { params: {} })
      logger.info(`${method} ${path}`, { orgId, status: response.status, ms: Date.now() - start, via: 'api_key' })
      return response
    } catch (err) {
      Sentry.captureException(err)
      logger.error(`${method} ${path} failed`, err, { ms: Date.now() - start })
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
  }
}
