/**
 * Approval step access tokens (migration 091) — the mint/resolve/consume layer
 * behind email-link approvals. A token is a 256-bit random secret bound to one
 * (approval_id, step_id, user_id) triple. The public /api/approvals/act route
 * exchanges it for a decision, running `decideOnStep` as the bound user so the
 * engine's approver guard passes unchanged.
 *
 * The generated rbac/091 columns aren't in the Database type yet, so we cast the
 * client per-call (`supabase as any`) like the other new-table facades.
 */

import { randomBytes } from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'

type Supabase = SupabaseClient<Database>

const TTL_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

function randomToken(): string {
  return randomBytes(32).toString('hex')
}

export interface MintStepTokensInput {
  orgId:      string
  approvalId: string
  stepId:     string
  userIds:    string[]
}

/**
 * Mint one one-time token per approver of a step (7-day TTL). Returns a
 * user_id → token map so the notifier can drop the right link into each
 * approver's email. Returns {} for an empty approver list.
 */
export async function mintStepTokens(
  supabase: Supabase,
  input: MintStepTokensInput,
): Promise<Record<string, string>> {
  const userIds = Array.from(new Set(input.userIds)).filter(Boolean)
  if (userIds.length === 0) return {}

  const expiresAt = new Date(Date.now() + TTL_MS).toISOString()
  const byUser: Record<string, string> = {}
  const rows = userIds.map(userId => {
    const token = randomToken()
    byUser[userId] = token
    return {
      org_id:      input.orgId,
      approval_id: input.approvalId,
      step_id:     input.stepId,
      user_id:     userId,
      token,
      expires_at:  expiresAt,
    }
  })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any
  const { error } = await sb.from('approval_step_access_tokens').insert(rows)
  if (error) throw error
  return byUser
}

export interface ResolvedStepToken {
  orgId:      string
  approvalId: string
  stepId:     string
  userId:     string
  expired:    boolean
  used:       boolean
}

/**
 * Read-only validation: look a token up and report its bound identity plus
 * whether it's expired or already used. Returns null when the token doesn't
 * exist. Never mutates — use `consumeStepToken` to actually spend it.
 */
export async function resolveStepToken(
  supabase: Supabase,
  token: string,
): Promise<ResolvedStepToken | null> {
  if (!token) return null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any
  const { data, error } = await sb
    .from('approval_step_access_tokens')
    .select('org_id, approval_id, step_id, user_id, expires_at, used_at')
    .eq('token', token)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  const row = data as {
    org_id: string; approval_id: string; step_id: string; user_id: string
    expires_at: string; used_at: string | null
  }
  return {
    orgId:      row.org_id,
    approvalId: row.approval_id,
    stepId:     row.step_id,
    userId:     row.user_id,
    expired:    new Date(row.expires_at).getTime() <= Date.now(),
    used:       row.used_at != null,
  }
}

export interface ConsumedStepToken {
  orgId:      string
  approvalId: string
  stepId:     string
  userId:     string
}

/**
 * Atomically spend a token: flips used_at only if it's still unused and unexpired
 * (`UPDATE ... WHERE used_at IS NULL AND expires_at > now RETURNING`). Returns the
 * bound identity on success, or null if the token was already used, expired, or
 * doesn't exist — so a double-submit can never record two decisions.
 */
export async function consumeStepToken(
  supabase: Supabase,
  token: string,
): Promise<ConsumedStepToken | null> {
  if (!token) return null
  const nowIso = new Date().toISOString()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any
  const { data, error } = await sb
    .from('approval_step_access_tokens')
    .update({ used_at: nowIso })
    .eq('token', token)
    .is('used_at', null)
    .gt('expires_at', nowIso)
    .select('org_id, approval_id, step_id, user_id')
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  const row = data as { org_id: string; approval_id: string; step_id: string; user_id: string }
  return { orgId: row.org_id, approvalId: row.approval_id, stepId: row.step_id, userId: row.user_id }
}
