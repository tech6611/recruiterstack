import { NextRequest, NextResponse } from 'next/server'
import { type ZodType, ZodError } from 'zod'
import * as Sentry from '@sentry/nextjs'
import { requireOrg, requireOrgAndUser } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'
import { getViewerScope, assertCapability, type ViewerScope } from '@/lib/rbac'
import type { Capability } from '@/lib/permissions'
import { logger } from '@/lib/logger'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClient = ReturnType<typeof createAdminClient>

type OrgHandler = (
  req: NextRequest,
  orgId: string,
  supabase: SupabaseClient,
  ctx: { params: Record<string, string> },
) => Promise<NextResponse | Response>

/**
 * Wraps a route handler with auth (requireOrg), Supabase client creation,
 * error handling, and request logging.
 */
export function withOrg(handler: OrgHandler) {
  return async (req: NextRequest, ctx?: { params: Record<string, string> }) => {
    const start = Date.now()
    const method = req.method
    const path = new URL(req.url).pathname

    try {
      const authResult = await requireOrg()
      if (authResult instanceof NextResponse) return authResult
      const { orgId } = authResult

      Sentry.setTag('org_id', orgId)
      const supabase = createAdminClient()
      const response = await handler(req, orgId, supabase, ctx ?? { params: {} })

      logger.info(`${method} ${path}`, { orgId, status: response.status, ms: Date.now() - start })
      return response
    } catch (err) {
      Sentry.captureException(err)
      logger.error(`${method} ${path} failed`, err, { ms: Date.now() - start })
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
  }
}

type CapabilityHandler = (
  req: NextRequest,
  orgId: string,
  supabase: SupabaseClient,
  ctx: { params: Record<string, string> },
  scope: ViewerScope,
  userId: string,
) => Promise<NextResponse | Response>

/**
 * Like `withOrg`, but additionally resolves the caller's RBAC scope and enforces
 * a capability (RBAC Slice 1). Returns 403 if the capability is missing. The
 * handler receives the resolved `scope` (for any further self/manager checks)
 * and the viewer's `userId`. Migrate a guarded route by swapping
 * `withOrg(async (req, orgId, supabase) => …)` →
 * `withCapability('module:action', async (req, orgId, supabase) => …)`.
 */
export function withCapability(capability: Capability, handler: CapabilityHandler) {
  return async (req: NextRequest, ctx?: { params: Record<string, string> }) => {
    const start = Date.now()
    const method = req.method
    const path = new URL(req.url).pathname

    try {
      const auth = await requireOrgAndUser()
      if (auth instanceof NextResponse) return auth
      const { orgId, userId } = auth

      Sentry.setTag('org_id', orgId)
      const supabase = createAdminClient()
      const scope = await getViewerScope(supabase, orgId, userId)
      const denied = assertCapability(scope, capability)
      if (denied) {
        logger.info(`${method} ${path}`, { orgId, status: 403, ms: Date.now() - start })
        return denied
      }

      const response = await handler(req, orgId, supabase, ctx ?? { params: {} }, scope, userId)
      logger.info(`${method} ${path}`, { orgId, status: response.status, ms: Date.now() - start })
      return response
    } catch (err) {
      Sentry.captureException(err)
      logger.error(`${method} ${path} failed`, err, { ms: Date.now() - start })
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
  }
}

/**
 * Parse a request body and validate with a Zod schema.
 * Returns parsed data or a 400 NextResponse with validation errors.
 */
export async function parseBody<T>(req: NextRequest, schema: ZodType<T>): Promise<T | NextResponse> {
  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  try {
    return schema.parse(raw)
  } catch (err) {
    if (err instanceof ZodError) {
      const issues = err.issues.map(i => ({
        path: i.path.join('.'),
        message: i.message,
      }))
      return NextResponse.json({ error: 'Validation failed', issues }, { status: 400 })
    }
    throw err
  }
}

/**
 * Escape special PostgREST filter characters to prevent injection in .or() queries.
 */
export function sanitizeSearch(input: string): string {
  return input.replace(/[%_\\,().]/g, '\\$&')
}

/**
 * Map Supabase/PostgREST errors to consistent HTTP responses.
 */
export function handleSupabaseError(error: { code: string; message: string }): NextResponse {
  const map: Record<string, { status: number; message: string }> = {
    '23505': { status: 409, message: 'A record with this value already exists' },
    PGRST116: { status: 404, message: 'Record not found' },
    PGRST205: { status: 503, message: 'Table not available' },
  }

  const mapped = map[error.code]
  if (mapped) {
    return NextResponse.json({ error: mapped.message }, { status: mapped.status })
  }

  logger.error('Supabase error', undefined, { code: error.code, message: error.message })
  return NextResponse.json({ error: error.message }, { status: 500 })
}
