/**
 * Interviewer availability preferences facade (migration 080).
 *
 * Each interviewer has preferred interview hours, expressed as weekly
 * availability windows in their own timezone. The candidate self-schedule
 * link reads these (Phase 2) to offer only slots inside those hours that are
 * also free on the interviewer's calendar.
 *
 * Hiring managers edit their own preferences WITHOUT logging in, via a public
 * `edit_token` link (/interviewer/[token]). Preferences are keyed by
 * (org_id, email) — email is how interviewers are identified everywhere in the
 * scheduling code.
 *
 * The `interviewer_preferences` table is not in the generated Database types
 * yet, so calls cast the client to an untyped Postgrest surface.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { randomBytes } from 'crypto'

/** One weekly availability block. day: 0=Sun..6=Sat. start/end: minutes from midnight. */
export interface AvailabilityWindow {
  day:   number
  start: number
  end:   number
}

export interface InterviewerPreference {
  email:    string
  name:     string | null
  timezone: string
  windows:  AvailabilityWindow[]
  note:     string | null
  /** Soft daily target (display only). null = not set. */
  minPerDay: number | null
  /** Hard daily cap — the availability engine won't offer slots past it. null = no limit. */
  maxPerDay: number | null
}

export const DEFAULT_TIMEZONE = 'Asia/Kolkata'

/** Default when an interviewer hasn't set anything: Mon–Fri, 09:00–18:00. */
export const DEFAULT_WINDOWS: AvailabilityWindow[] = [1, 2, 3, 4, 5].map(day => ({
  day,
  start: 9 * 60,
  end:   18 * 60,
}))

// The table isn't in the generated Database types; use an untyped surface.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function table(supabase: SupabaseClient): any {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (supabase as any).from('interviewer_preferences')
}

const norm = (email: string) => email.trim().toLowerCase()

/**
 * Ensure a (org, email) preference row exists and return its public edit-link
 * token, generating one if absent. Reuses the existing token so re-sending a
 * link doesn't invalidate an earlier one. Updates the display name if given.
 */
export async function ensureInterviewerPreferenceLink(
  supabase: SupabaseClient,
  orgId: string,
  email: string,
  name?: string | null,
): Promise<string> {
  const em = norm(email)

  const { data: existing } = await table(supabase)
    .select('edit_token')
    .eq('org_id', orgId)
    .eq('email', em)
    .maybeSingle()

  if (existing?.edit_token) {
    if (name) {
      await table(supabase)
        .update({ name, updated_at: new Date().toISOString() })
        .eq('org_id', orgId)
        .eq('email', em)
    }
    return existing.edit_token as string
  }

  const token = randomBytes(20).toString('hex')
  await table(supabase).upsert(
    {
      org_id:     orgId,
      email:      em,
      name:       name ?? null,
      edit_token: token,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'org_id,email' },
  )
  return token
}

export interface InterviewerPreferenceByToken extends InterviewerPreference {
  orgId: string
}

/** Resolve an interviewer's preferences by their public edit token, or null. */
export async function getInterviewerPreferenceByToken(
  supabase: SupabaseClient,
  token: string,
): Promise<InterviewerPreferenceByToken | null> {
  const { data } = await table(supabase)
    .select('org_id, email, name, timezone, windows, note, min_per_day, max_per_day')
    .eq('edit_token', token)
    .maybeSingle()

  if (!data) return null
  return {
    orgId:     data.org_id,
    email:     data.email,
    name:      data.name ?? null,
    timezone:  data.timezone ?? DEFAULT_TIMEZONE,
    windows:   Array.isArray(data.windows) ? (data.windows as AvailabilityWindow[]) : [],
    note:      data.note ?? null,
    minPerDay: typeof data.min_per_day === 'number' ? data.min_per_day : null,
    maxPerDay: typeof data.max_per_day === 'number' ? data.max_per_day : null,
  }
}

/** Save an interviewer's windows/timezone/note/load limits via their public edit token. */
export async function saveInterviewerPreferenceByToken(
  supabase: SupabaseClient,
  token: string,
  fields: {
    timezone: string
    windows: AvailabilityWindow[]
    note: string | null
    minPerDay: number | null
    maxPerDay: number | null
  },
): Promise<boolean> {
  const { error } = await table(supabase)
    .update({
      timezone:    fields.timezone,
      windows:     fields.windows,
      note:        fields.note,
      min_per_day: fields.minPerDay,
      max_per_day: fields.maxPerDay,
      updated_at:  new Date().toISOString(),
    })
    .eq('edit_token', token)
  return !error
}

/**
 * Fetch preferences for a set of interviewer emails (one org). Emails with no
 * stored row — or a stored row with empty windows — fall back to the default
 * Mon–Fri 09:00–18:00 window. Always returns an entry for every requested email.
 * (Used by the Phase 2 availability engine.)
 */
export async function getInterviewerPreferences(
  supabase: SupabaseClient,
  orgId: string,
  emails: string[],
): Promise<Record<string, InterviewerPreference>> {
  const wanted = Array.from(new Set(emails.map(norm))).filter(Boolean)
  const out: Record<string, InterviewerPreference> = {}

  const withDefault = (email: string, row?: Partial<InterviewerPreference>): InterviewerPreference => {
    const windows = row?.windows && row.windows.length ? row.windows : DEFAULT_WINDOWS
    return {
      email,
      name:      row?.name ?? null,
      timezone:  row?.timezone || DEFAULT_TIMEZONE,
      windows,
      note:      row?.note ?? null,
      minPerDay: row?.minPerDay ?? null,
      maxPerDay: row?.maxPerDay ?? null,
    }
  }

  if (wanted.length === 0) return out

  const { data } = await table(supabase)
    .select('email, name, timezone, windows, note, min_per_day, max_per_day')
    .eq('org_id', orgId)
    .in('email', wanted)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const byEmail = new Map<string, any>((data ?? []).map((r: any) => [norm(r.email), r]))
  for (const em of wanted) {
    const r = byEmail.get(em)
    out[em] = withDefault(em, r
      ? {
          name: r.name, timezone: r.timezone,
          windows: Array.isArray(r.windows) ? r.windows : [], note: r.note,
          minPerDay: typeof r.min_per_day === 'number' ? r.min_per_day : null,
          maxPerDay: typeof r.max_per_day === 'number' ? r.max_per_day : null,
        }
      : undefined)
  }
  return out
}
