// Canonical funnel steps — Ashby's "Stage Group".
//
// A job's stages have custom names, but each maps to one shared funnel step so
// reporting and agents reason in a common vocabulary across jobs. This is the
// single pure source of truth for that vocabulary; the DB stores only the chosen
// step id per stage (pipeline_stages.funnel_step, migration 131).

import type { StageZone } from '@/lib/pipeline/zones'

export interface FunnelStep {
  id: string
  label: string
  zone: StageZone
}

/** The canonical steps, in funnel order, grouped by zone. */
export const FUNNEL_STEPS: readonly FunnelStep[] = [
  // Lead zone
  { id: 'sourced',            label: 'Sourced',            zone: 'lead' },
  { id: 'outreach',           label: 'Outreach',           zone: 'lead' },
  { id: 'engaged',            label: 'Engaged',            zone: 'lead' },
  // Active zone
  { id: 'application_review', label: 'Application Review',  zone: 'active' },
  { id: 'recruiter_screen',   label: 'Recruiter Screen',   zone: 'active' },
  { id: 'assessment',         label: 'Assessment',         zone: 'active' },
  { id: 'technical',          label: 'Technical Interview', zone: 'active' },
  { id: 'hiring_manager',     label: 'Hiring Manager',     zone: 'active' },
  { id: 'onsite',             label: 'Onsite / Panel',     zone: 'active' },
  // Offer zone
  { id: 'reference_check',    label: 'Reference Check',    zone: 'offer' },
  { id: 'offer',              label: 'Offer',              zone: 'offer' },
  // Completed zone
  { id: 'hired',              label: 'Hired',              zone: 'completed' },
  { id: 'archived',           label: 'Archived',           zone: 'completed' },
] as const

const BY_ID = new Map(FUNNEL_STEPS.map(s => [s.id, s]))

/** Every valid funnel-step id (for validation). */
export const FUNNEL_STEP_IDS: readonly string[] = FUNNEL_STEPS.map(s => s.id)

/** Look up a step by id (undefined if unknown). */
export function funnelStep(id: string | null | undefined): FunnelStep | undefined {
  return id ? BY_ID.get(id) : undefined
}

/** Human label for a step id, or a graceful fallback. */
export function funnelStepLabel(id: string | null | undefined): string {
  return funnelStep(id)?.label ?? (id ?? '—')
}

/** Steps offered for a given zone (the sensible options for a stage in that zone). */
export function funnelStepsForZone(zone: StageZone): FunnelStep[] {
  return FUNNEL_STEPS.filter(s => s.zone === zone)
}

/** Default funnel step for a seeded default stage name — mirrors migration 131's
 *  backfill so code and DB agree. Custom names return null (recruiter sets one). */
export function defaultFunnelStepForStageName(name: string): string | null {
  switch (name.trim().toLowerCase()) {
    case 'new lead':     return 'sourced'
    case 'reached out':  return 'outreach'
    case 'replied':      return 'engaged'
    case 'applied':      return 'application_review'
    case 'screening':    return 'recruiter_screen'
    case 'phone screen': return 'recruiter_screen'
    case 'interview':    return 'hiring_manager'
    case 'offer':        return 'offer'
    case 'hired':        return 'hired'
    case 'rejected':
    case 'archived':     return 'archived'
    default:             return null
  }
}
