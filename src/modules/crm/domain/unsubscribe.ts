import type { SupabaseClient } from '@supabase/supabase-js'
import { encrypt, decrypt } from '@/lib/crypto'
import { logger } from '@/lib/logger'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DB = SupabaseClient<any>

// The canonical tag we stamp when someone unsubscribes. This is a SOFT block:
// it stops cold-outreach sequences (bulk enrollment excludes it, and any in-flight
// sequence send is halted) but — unlike a hard 'do-not-contact' — it does NOT mean
// "never touch this person". If they were an inbound lead you can still reply 1:1.
export const UNSUBSCRIBE_TAG = 'candidate-unsubscribe'

// Tags that suppress a candidate from cold-outreach sequences: the hard
// do-not-contact family plus the soft unsubscribe tag. Used both by the bulk
// enrollment exclusion and by the per-send compliance guard.
export const SEQUENCE_SUPPRESS_TAGS = ['do-not-contact', 'do_not_contact', 'dnc', UNSUBSCRIBE_TAG]

// ── Stateless token ───────────────────────────────────────────────────────────
// We don't store a per-email token. Instead we encrypt {org, candidate} with the
// app's AES-256-GCM key and base64url-encode it into a single URL-safe segment.
// Only our server can mint or read it (tamper-proof via the GCM auth tag), so the
// link can't be forged to unsubscribe an arbitrary candidate.

export function makeUnsubscribeToken(orgId: string, candidateId: string): string {
  const encrypted = encrypt(JSON.stringify({ o: orgId, c: candidateId }))
  return Buffer.from(encrypted, 'utf8').toString('base64url')
}

export function parseUnsubscribeToken(token: string): { orgId: string; candidateId: string } | null {
  try {
    const encrypted = Buffer.from(token, 'base64url').toString('utf8')
    const payload = JSON.parse(decrypt(encrypted)) as { o?: string; c?: string }
    if (!payload.o || !payload.c) return null
    return { orgId: payload.o, candidateId: payload.c }
  } catch {
    return null
  }
}

// ── Email footer ──────────────────────────────────────────────────────────────

/** Absolute unsubscribe URL for a candidate in an org. */
export function unsubscribeUrl(orgId: string, candidateId: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? 'https://recruiterstack.in'
  return `${base.replace(/\/$/, '')}/unsubscribe/${makeUnsubscribeToken(orgId, candidateId)}`
}

/** Small, plain footer appended to every outbound sequence email. */
export function unsubscribeFooterHtml(url: string): string {
  return (
    `<div style="margin-top:24px;padding-top:12px;border-top:1px solid #e2e8f0;` +
    `font-size:12px;color:#94a3b8;font-family:Arial,sans-serif;">` +
    `Don't want these emails? ` +
    `<a href="${url}" style="color:#94a3b8;text-decoration:underline;">Unsubscribe</a>.` +
    `</div>`
  )
}

// ── Actions ───────────────────────────────────────────────────────────────────

/**
 * True if the candidate is suppressed from cold-outreach sequences — either a hard
 * do-not-contact tag or the soft candidate-unsubscribe tag. Used as the per-send
 * compliance guard so an unsubscribe mid-sequence halts remaining stages.
 */
export async function isSuppressedFromSequences(db: DB, orgId: string, candidateId: string): Promise<boolean> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (db as any).from('candidate_tags')
    .select('candidate_id')
    .eq('org_id', orgId)
    .eq('candidate_id', candidateId)
    .in('tag', SEQUENCE_SUPPRESS_TAGS)
    .limit(1)
  return (data?.length ?? 0) > 0
}

/**
 * Record an unsubscribe: stamp the candidate-unsubscribe tag (idempotent) and stop
 * every still-active enrollment for this candidate. Safe to call more than once.
 */
export async function unsubscribeCandidate(db: DB, orgId: string, candidateId: string): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: tagErr } = await (db as any).from('candidate_tags').insert({
    org_id: orgId, candidate_id: candidateId, tag: UNSUBSCRIBE_TAG,
  })
  // 23505 = tag already present; anything else is worth surfacing but not fatal.
  if (tagErr && tagErr.code !== '23505') {
    logger.error('Unsubscribe: failed to add do-not-contact tag', tagErr, { orgId, candidateId })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (db as any).from('sequence_enrollments')
    .update({ status: 'unsubscribed', completed_at: new Date().toISOString() })
    .eq('org_id', orgId)
    .eq('candidate_id', candidateId)
    .eq('status', 'active')

  logger.info('Candidate unsubscribed from sequences', { orgId, candidateId })
}
