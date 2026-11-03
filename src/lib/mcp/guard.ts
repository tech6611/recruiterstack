import type { SupabaseClient } from '@supabase/supabase-js'
import type { AuthInfo } from '@modelcontextprotocol/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getViewerScope, type ViewerScope } from '@/lib/rbac'
import type { Capability } from '@/lib/permissions'
import { callerFrom, type McpCaller } from './verify-token'
import { isApprovedClient } from './clients'

/**
 * The per-call security check for every MCP tool. A tool runs only if ALL hold:
 *
 *   1. the AI app is approved                       (clients.ts)
 *   2. the user granted the tool's OAuth scope      (token `scope`)
 *   3. the user exists in RecruiterStack and isn't deactivated
 *   4. AI app access is on for the workspace        (ai_app_settings; no row = on)
 *   5. this user hasn't disconnected this AI app    (ai_app_connections.revoked_at)
 *   6. the user is an ACTIVE member of the workspace with a role that has the
 *      tool's capability                            (existing RBAC: getViewerScope)
 *
 * Effective power = scopes granted ∩ RecruiterStack role ∩ workspace policy —
 * an AI app can never do more than the person could do in the RecruiterStack UI.
 * The workspace always comes from the verified token (Clerk-signed org_id),
 * never from tool input.
 */

/** OAuth scopes we define in Clerk (see doc section 4). */
export type McpScope =
  | 'jobs:read'
  | 'candidates:read'
  | 'candidates:contact'
  | 'sourcing:run'
  | 'pipeline:write'
  | 'notes:write'

export type ToolRequirement = {
  /** OAuth scope the user must have granted. null = any authenticated connection (e.g. whoami). */
  scope: McpScope | null
  /** RecruiterStack capability the user's role must have. */
  capability: Extract<Capability, 'recruiting:view' | 'recruiting:edit'>
}

export type DenialCode =
  | 'client_not_approved'
  | 'missing_scope'
  | 'user_not_found'
  | 'ai_access_off'
  | 'connection_revoked'
  | 'not_a_member'
  | 'role_not_allowed'

/** A refusal with a message that is safe and useful to show the user in the chat. */
export class McpDenied extends Error {
  constructor(
    public readonly code: DenialCode,
    message: string,
  ) {
    super(message)
    this.name = 'McpDenied'
  }
}

export type McpContext = {
  caller: McpCaller
  /** Our internal users.id (UUID) — NOT the Clerk user id. */
  userId: string
  orgId: string
  viewer: ViewerScope
  supabase: SupabaseClient
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LooseSb = any // ai_app_* tables aren't in the generated Supabase types yet

export async function authorizeCall(
  authInfo: AuthInfo | undefined,
  req: ToolRequirement,
  supabase: SupabaseClient = createAdminClient() as unknown as SupabaseClient,
): Promise<McpContext> {
  const caller = callerFrom(authInfo)
  const sb = supabase as LooseSb

  // 1. Approved AI app (cheap, no DB)
  if (!isApprovedClient(caller.clientId)) {
    throw new McpDenied('client_not_approved', 'This AI app is not approved to connect to RecruiterStack.')
  }

  // 2. Scope granted at consent (cheap, no DB)
  if (req.scope && !caller.scopes.includes(req.scope)) {
    throw new McpDenied(
      'missing_scope',
      `This connection wasn't given the "${req.scope}" permission. Disconnect RecruiterStack in this AI app and connect again to grant it.`,
    )
  }

  // 3. Clerk user → our internal user; deactivated users are refused
  const { data: user } = await sb
    .from('users')
    .select('id, deactivated_at')
    .eq('clerk_user_id', caller.userId)
    .maybeSingle()
  if (!user || user.deactivated_at) {
    throw new McpDenied('user_not_found', 'Your RecruiterStack account could not be found or is deactivated.')
  }
  const userId = user.id as string
  const orgId = caller.orgId

  // 4 + 5. Workspace switch and this connection's revocation, in parallel
  const [{ data: settings }, { data: connection }] = await Promise.all([
    sb.from('ai_app_settings').select('enabled').eq('org_id', orgId).maybeSingle(),
    sb
      .from('ai_app_connections')
      .select('id, revoked_at')
      .eq('org_id', orgId)
      .eq('user_id', userId)
      .eq('client_id', caller.clientId)
      .maybeSingle(),
  ])
  if (settings && settings.enabled === false) {
    throw new McpDenied('ai_access_off', 'An admin has turned off AI app access for this RecruiterStack workspace.')
  }
  if (connection?.revoked_at) {
    throw new McpDenied(
      'connection_revoked',
      'This AI app was disconnected from RecruiterStack. Reconnect it from RecruiterStack to use it again.',
    )
  }

  // 6. Active membership + role capability (existing RBAC)
  const viewer = await getViewerScope(supabase as never, orgId, userId)
  if (!viewer.role) {
    throw new McpDenied('not_a_member', 'You are not an active member of this RecruiterStack workspace.')
  }
  const hasCapability =
    viewer.capabilities.has(req.capability) ||
    // Limited viewers (e.g. hiring managers) may READ the jobs they're on; tools filter by viewer.jobIds.
    (req.capability === 'recruiting:view' && viewer.jobIds.size > 0)
  if (!hasCapability) {
    throw new McpDenied('role_not_allowed', "Your RecruiterStack role doesn't allow this action.")
  }

  // Record / refresh the connection (first use creates it). Best-effort: never blocks the call.
  await sb
    .from('ai_app_connections')
    .upsert(
      { org_id: orgId, user_id: userId, client_id: caller.clientId, last_used_at: new Date().toISOString() },
      { onConflict: 'org_id,user_id,client_id' },
    )
    .then(
      ({ error }: { error: unknown }) => error && console.error('[mcp] connection upsert failed', error),
      (err: unknown) => console.error('[mcp] connection upsert threw', err),
    )

  return { caller, userId, orgId, viewer, supabase }
}

/** Keep only *_id / *_ids arguments for the audit log — never free text or candidate data. */
export function auditableIds(args: unknown): Record<string, unknown> {
  if (!args || typeof args !== 'object') return {}
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(args as Record<string, unknown>)) {
    if (/_ids?$/.test(k)) out[k] = v
  }
  return out
}

export type AuditEntry = {
  orgId: string | null
  userId: string | null
  clerkUserId: string | null
  clientId: string | null
  tool: string
  outcome: 'ok' | 'denied' | 'error'
  reason?: string | null
  inputIds?: Record<string, unknown>
  resultCount?: number | null
  latencyMs?: number | null
}

/** Write one audit row. Never throws: a logging failure must not break the tool. */
export async function recordAudit(
  entry: AuditEntry,
  supabase: SupabaseClient = createAdminClient() as unknown as SupabaseClient,
): Promise<void> {
  try {
    const { error } = await (supabase as LooseSb).from('ai_app_audit').insert({
      org_id: entry.orgId,
      user_id: entry.userId,
      clerk_user_id: entry.clerkUserId,
      client_id: entry.clientId,
      tool: entry.tool,
      outcome: entry.outcome,
      reason: entry.reason ?? null,
      input_ids: entry.inputIds ?? {},
      result_count: entry.resultCount ?? null,
      latency_ms: entry.latencyMs ?? null,
    })
    if (error) console.error('[mcp] audit insert failed', error)
  } catch (err) {
    console.error('[mcp] audit insert threw', err)
  }
}
