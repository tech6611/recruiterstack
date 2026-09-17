import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'

// Application-event display hygiene. Every writer is supposed to store stage NAMES
// in from_stage/to_stage and a human label in created_by — but the automation
// engine (pre-2026-09-17) wrote raw stage UUIDs, and several routes store the
// Clerk user id. Rather than leak "72774910-c06c-…" or "user_3Goya…" into the
// activity feed, every read path passes its events through here first.
//
// Pure DB lookups, org-scoped through the caller's client; unknown ids are left
// as-is so the client-side actorLabel() can still show a generic fallback.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sb = SupabaseClient<Database> | any

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID_RE.test(v)
export const isClerkUserId = (v: unknown): v is string => typeof v === 'string' && v.startsWith('user_')

interface EventLike {
  from_stage?: string | null
  to_stage?: string | null
  created_by?: string | null
}

/** Replace stage UUIDs with stage names and Clerk user ids with the person's
 *  full name, in place, across a list of events. One query per lookup kind. */
export async function resolveEventDisplayFields<T extends EventLike>(sb: Sb, events: T[]): Promise<T[]> {
  if (!events.length) return events

  const stageIds = new Set<string>()
  const userIds  = new Set<string>()
  for (const e of events) {
    if (isUuid(e.from_stage)) stageIds.add(e.from_stage)
    if (isUuid(e.to_stage))   stageIds.add(e.to_stage)
    if (isClerkUserId(e.created_by)) userIds.add(e.created_by)
  }
  if (!stageIds.size && !userIds.size) return events

  const [stagesRes, usersRes] = await Promise.all([
    stageIds.size
      ? sb.from('pipeline_stages').select('id, name').in('id', Array.from(stageIds))
      : Promise.resolve({ data: [] as Array<{ id: string; name: string }> }),
    userIds.size
      ? sb.from('users').select('clerk_user_id, full_name, first_name, last_name, email').in('clerk_user_id', Array.from(userIds))
      : Promise.resolve({ data: [] as Array<{ clerk_user_id: string; full_name: string | null; first_name: string | null; last_name: string | null; email: string | null }> }),
  ])

  const stageName = new Map<string, string>()
  for (const s of (stagesRes.data ?? []) as Array<{ id: string; name: string }>) stageName.set(s.id, s.name)

  const userName = new Map<string, string>()
  for (const u of (usersRes.data ?? []) as Array<{ clerk_user_id: string; full_name: string | null; first_name: string | null; last_name: string | null; email: string | null }>) {
    const name = u.full_name?.trim() || [u.first_name, u.last_name].filter(Boolean).join(' ').trim() || u.email || null
    if (name) userName.set(u.clerk_user_id, name)
  }

  for (const e of events) {
    if (isUuid(e.from_stage) && stageName.has(e.from_stage)) e.from_stage = stageName.get(e.from_stage)!
    if (isUuid(e.to_stage)   && stageName.has(e.to_stage))   e.to_stage   = stageName.get(e.to_stage)!
    if (isClerkUserId(e.created_by) && userName.has(e.created_by)) e.created_by = userName.get(e.created_by)!
  }
  return events
}
