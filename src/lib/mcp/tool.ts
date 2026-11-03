import type { SupabaseClient } from '@supabase/supabase-js'
import type { AuthInfo } from '@modelcontextprotocol/server'
import { createAdminClient } from '@/lib/supabase/server'
import { authorizeCall, auditableIds, McpDenied, recordAudit, type McpContext, type ToolRequirement } from './guard'

/**
 * Wrap an MCP tool so it ALWAYS goes through the security check and the audit log.
 * Every RecruiterStack MCP tool must be registered through `guarded(...)` — a tool
 * that skips it has no permission checks.
 *
 *   - refused  → the user sees the plain-English reason; audit outcome 'denied'
 *   - crashed  → the user sees a generic message (no internals); audit outcome 'error'
 *   - success  → audit outcome 'ok' with the number of records returned
 */

export type ToolResult = {
  content: Array<{ type: 'text'; text: string }>
  structuredContent?: Record<string, unknown>
  isError?: boolean
}

type ToolCtx = { http?: { authInfo?: AuthInfo } }

function errorResult(text: string): ToolResult {
  return { isError: true, content: [{ type: 'text', text }] }
}

export function guarded<A>(
  tool: string,
  requirement: ToolRequirement,
  run: (args: A, ctx: McpContext) => Promise<ToolResult & { resultCount?: number }>,
  deps: { supabase?: () => SupabaseClient } = {},
) {
  return async (args: A, toolCtx: ToolCtx): Promise<ToolResult> => {
    const started = Date.now()
    const supabase = (deps.supabase ?? (() => createAdminClient() as unknown as SupabaseClient))()
    const authInfo = toolCtx.http?.authInfo
    const caller = authInfo?.extra?.caller as McpContext['caller'] | undefined
    const base = {
      orgId: caller?.orgId ?? null,
      clerkUserId: caller?.userId ?? null,
      clientId: caller?.clientId ?? null,
      tool,
      inputIds: auditableIds(args),
    }

    let ctx: McpContext
    try {
      ctx = await authorizeCall(authInfo, requirement, supabase)
    } catch (err) {
      const denied = err instanceof McpDenied
      await recordAudit(
        { ...base, userId: null, outcome: denied ? 'denied' : 'error', reason: denied ? err.code : 'auth_error', latencyMs: Date.now() - started },
        supabase,
      )
      if (!denied) console.error(`[mcp] ${tool}: authorization crashed`, err)
      return errorResult(denied ? err.message : 'RecruiterStack could not check your access just now. Please try again.')
    }

    try {
      const { resultCount, ...result } = await run(args, ctx)
      await recordAudit(
        { ...base, userId: ctx.userId, outcome: 'ok', resultCount: resultCount ?? null, latencyMs: Date.now() - started },
        supabase,
      )
      return result
    } catch (err) {
      console.error(`[mcp] ${tool} failed`, err)
      await recordAudit(
        { ...base, userId: ctx.userId, outcome: 'error', reason: err instanceof Error ? err.name : 'unknown', latencyMs: Date.now() - started },
        supabase,
      )
      return errorResult(`RecruiterStack hit a problem running "${tool}". Please try again; if it keeps happening, contact support.`)
    }
  }
}
