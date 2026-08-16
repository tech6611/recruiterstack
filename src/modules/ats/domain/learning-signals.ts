import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'

type Supabase = SupabaseClient<Database>
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LooseSb = any

/**
 * Learning loop — failure-mode separation (Sourcing Brain, Slice 3).
 *
 * The strategist's discipline: before adjusting the ICP, diagnose WHY candidates
 * fall out. A rejection at review means the FIT model is wrong; a candidate who
 * never replies means the REACHABILITY model is wrong; a declined offer means the
 * MOVABILITY / comp model is wrong. These need different fixes — only the fit ones
 * should refine the ICP.
 */

export type Outcome =
  | 'hired'
  | 'advanced'
  | 'fit_miss'       // recruiter rejected on fit
  | 'no_reply'       // never replied to outreach (reachability)
  | 'declined_offer' // declined an offer (movability / comp)
  | 'maybe'
  | 'pending'

export interface OutcomeSignals {
  review_status?: string | null       // yes | no | maybe | reviewed | unreviewed
  offer_status?: string | null        // accepted | declined | ...
  enrolled?: boolean
  replied?: boolean
  enrollment_terminal?: boolean        // the sequence ran out without a reply
}

/** Classify one candidate's outcome into a single failure/success mode. PURE + tested. */
export function classifyOutcome(s: OutcomeSignals): Outcome {
  if (s.offer_status === 'accepted') return 'hired'
  if (s.offer_status === 'declined') return 'declined_offer'
  if (s.review_status === 'no') return 'fit_miss'
  if (s.review_status === 'yes') return 'advanced'
  if (s.enrolled && !s.replied && s.enrollment_terminal) return 'no_reply'
  if (s.review_status === 'maybe') return 'maybe'
  return 'pending'
}

export interface FailureDiagnosis {
  total: number
  decided: number // outcomes that carry a signal (not pending)
  breakdown: Record<Outcome, number>
  dominant: Exclude<Outcome, 'hired' | 'advanced' | 'maybe' | 'pending'> | null
  guidance: string
}

const TERMINAL_ENROLL = new Set(['completed', 'bounced', 'unsubscribed', 'cancelled'])

/** Diagnose the job's pipeline: separate fit / reachability / movability. */
export async function diagnoseFailureModes(
  supabase: Supabase,
  orgId: string,
  jobId: string,
): Promise<FailureDiagnosis> {
  const sb = supabase as unknown as LooseSb

  const { data: apps } = await sb
    .from('applications')
    .select('id, candidate_id, review_status')
    .eq('org_id', orgId)
    .eq('job_id', jobId)
  const applications = (apps ?? []) as { id: string; candidate_id: string; review_status: string | null }[]

  const appIds = applications.map((a) => a.id)
  const candIds = applications.map((a) => a.candidate_id).filter(Boolean)

  // Offers by application (movability), enrollments by candidate (reachability).
  const [offersRes, enrollRes] = await Promise.all([
    appIds.length ? sb.from('offers').select('application_id, status').eq('org_id', orgId).in('application_id', appIds) : Promise.resolve({ data: [] }),
    candIds.length ? sb.from('sequence_enrollments').select('candidate_id, status').eq('org_id', orgId).in('candidate_id', candIds) : Promise.resolve({ data: [] }),
  ])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const offerByApp = new Map<string, string>((offersRes.data ?? []).map((o: any) => [o.application_id, o.status]))
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const enrollByCand = new Map<string, string[]>()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const e of (enrollRes.data ?? []) as any[]) {
    const arr = enrollByCand.get(e.candidate_id) ?? []
    arr.push(e.status)
    enrollByCand.set(e.candidate_id, arr)
  }

  const breakdown: Record<Outcome, number> = { hired: 0, advanced: 0, fit_miss: 0, no_reply: 0, declined_offer: 0, maybe: 0, pending: 0 }
  for (const a of applications) {
    const statuses = enrollByCand.get(a.candidate_id) ?? []
    const outcome = classifyOutcome({
      review_status: a.review_status,
      offer_status: offerByApp.get(a.id),
      enrolled: statuses.length > 0,
      replied: statuses.includes('replied'),
      enrollment_terminal: statuses.some((s) => TERMINAL_ENROLL.has(s)),
    })
    breakdown[outcome]++
  }

  const modes = { fit_miss: breakdown.fit_miss, no_reply: breakdown.no_reply, declined_offer: breakdown.declined_offer }
  const decided = breakdown.fit_miss + breakdown.no_reply + breakdown.declined_offer + breakdown.advanced + breakdown.hired
  let dominant: FailureDiagnosis['dominant'] = null
  let max = 0
  for (const [k, v] of Object.entries(modes)) if (v > max) { max = v; dominant = k as FailureDiagnosis['dominant'] }

  const guidance =
    max === 0
      ? 'Not enough decided candidates yet — mark a few Yes/No and let outreach run, then check back.'
      : dominant === 'fit_miss'
        ? 'Most drop-offs are fit calls — your ICP is what to sharpen. Use “Refine from feedback” to fold these decisions into the ICP.'
        : dominant === 'no_reply'
          ? 'Most drop-offs never replied — that’s a reachability problem, not fit. Revisit who you’re contacting and the outreach itself; refining the ICP won’t fix it.'
          : 'Candidates are declining offers — that’s a movability / comp / timing problem, not fit. Revisit the offer, comp band and target companies.'

  return { total: applications.length, decided, breakdown, dominant, guidance }
}
