/**
 * Copilot chat history (migration 157). One row per chat, private to the user
 * who started it. Every query is scoped by org_id AND user_id, so a user can
 * never read or change someone else's chats.
 *
 * `messages` is stored exactly as the chat window holds it (text, tool chips,
 * forms…) so a reopened chat looks the same as when it was left.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

// copilot_conversations isn't in the generated Database types yet.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = any

export interface ConversationSummary {
  id: string
  title: string
  updated_at: string
}

export interface Conversation extends ConversationSummary {
  messages: unknown[]
}

/** Keep stored chats bounded — the window only ever needs the recent history. */
export const MAX_STORED_MESSAGES = 200
export const MAX_TITLE_LENGTH = 80

/** Postgres "relation does not exist" — the migration hasn't been applied yet. */
export function isMissingTable(err: unknown): boolean {
  const e = err as { code?: string; message?: string } | null
  const msg = e?.message ?? ''
  return e?.code === '42P01' || e?.code === 'PGRST205' ||
    (/copilot_conversations/.test(msg) && /does not exist|schema cache/.test(msg))
}

export function cleanTitle(raw: unknown): string {
  const t = typeof raw === 'string' ? raw.replace(/\s+/g, ' ').trim() : ''
  if (!t) return 'New chat'
  return t.length > MAX_TITLE_LENGTH ? `${t.slice(0, MAX_TITLE_LENGTH - 1)}…` : t
}

export async function listConversations(
  supabase: SupabaseClient, orgId: string, userId: string, limit = 50,
): Promise<ConversationSummary[]> {
  const { data, error } = await (supabase as Loose)
    .from('copilot_conversations')
    .select('id, title, updated_at')
    .eq('org_id', orgId).eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return (data ?? []) as ConversationSummary[]
}

export async function getConversation(
  supabase: SupabaseClient, orgId: string, userId: string, id: string,
): Promise<Conversation | null> {
  const { data, error } = await (supabase as Loose)
    .from('copilot_conversations')
    .select('id, title, updated_at, messages')
    .eq('org_id', orgId).eq('user_id', userId).eq('id', id)
    .maybeSingle()
  if (error) throw error
  return (data ?? null) as Conversation | null
}

export async function createConversation(
  supabase: SupabaseClient, orgId: string, userId: string,
  input: { title?: string; messages?: unknown[] },
): Promise<Conversation> {
  const { data, error } = await (supabase as Loose)
    .from('copilot_conversations')
    .insert({
      org_id: orgId,
      user_id: userId,
      title: cleanTitle(input.title),
      messages: (input.messages ?? []).slice(-MAX_STORED_MESSAGES),
    })
    .select('id, title, updated_at, messages')
    .single()
  if (error) throw error
  return data as Conversation
}

export async function updateConversation(
  supabase: SupabaseClient, orgId: string, userId: string, id: string,
  patch: { title?: string; messages?: unknown[] },
): Promise<ConversationSummary | null> {
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (patch.title !== undefined) row.title = cleanTitle(patch.title)
  if (patch.messages !== undefined) row.messages = patch.messages.slice(-MAX_STORED_MESSAGES)
  const { data, error } = await (supabase as Loose)
    .from('copilot_conversations')
    .update(row)
    .eq('org_id', orgId).eq('user_id', userId).eq('id', id)
    .select('id, title, updated_at')
    .maybeSingle()
  if (error) throw error
  return (data ?? null) as ConversationSummary | null
}

export async function deleteConversation(
  supabase: SupabaseClient, orgId: string, userId: string, id: string,
): Promise<void> {
  const { error } = await (supabase as Loose)
    .from('copilot_conversations')
    .delete()
    .eq('org_id', orgId).eq('user_id', userId).eq('id', id)
  if (error) throw error
}
