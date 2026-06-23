/**
 * First-run "Getting started" checklist — static metadata + pure derivation.
 *
 * This module is CLIENT-SAFE (no server-only imports) so both the dashboard
 * banner and the notification bell can import it. The live "done" detection
 * (DB queries) and notification sync live in the server-only sibling
 * `checklist.ts`.
 *
 * The steps deliberately mirror the operational setup the signup wizard
 * (`/onboarding/*`) does NOT cover — departments, locations, approval chains,
 * first requisition, first published job — i.e. the exact path whose gaps stop a
 * job from ever going live.
 */

export type OnboardingAudience = 'org' | 'personal'

export type OnboardingStepKey =
  | 'departments'
  | 'locations'
  | 'approval_chain_requisition'
  | 'approval_chain_job'
  | 'first_requisition'
  | 'first_job_open'
  | 'invite_teammate'
  | 'connect_calendar'

export interface OnboardingStepMeta {
  key:         OnboardingStepKey
  label:       string
  description: string            // the one-line "why"
  href:        string            // where the CTA sends the user to do it
  audience:    OnboardingAudience // 'org' = admins act once for everyone; 'personal' = each user
}

/** Ordered the way a new customer should work through them. */
export const ONBOARDING_STEPS: readonly OnboardingStepMeta[] = [
  {
    key: 'departments',
    label: 'Create departments',
    description: 'Group requisitions and jobs, and target approvals by team.',
    href: '/settings?tab=workspace',
    audience: 'org',
  },
  {
    key: 'locations',
    label: 'Add office locations',
    description: 'Attach offices to requisitions and power location-based comp bands.',
    href: '/settings?tab=workspace',
    audience: 'org',
  },
  {
    key: 'approval_chain_requisition',
    label: 'Approval chain for requisitions',
    description: 'Required before a requisition can be submitted for sign-off.',
    href: '/admin/approvals',
    audience: 'org',
  },
  {
    key: 'approval_chain_job',
    label: 'Approval chain for jobs',
    description: 'Required before a job can be approved and opened to applicants.',
    href: '/admin/approvals',
    audience: 'org',
  },
  {
    key: 'first_requisition',
    label: 'Create your first requisition',
    description: 'Open the headcount request that starts your hiring cycle.',
    href: '/openings/new',
    audience: 'org',
  },
  {
    key: 'first_job_open',
    label: 'Publish your first job',
    description: 'Publishing a job creates its public apply link.',
    href: '/jobs',
    audience: 'org',
  },
  {
    key: 'invite_teammate',
    label: 'Invite a teammate',
    description: 'Bring colleagues in so approvals and hiring teams have people to route to.',
    href: '/settings?tab=team',
    audience: 'org',
  },
  {
    key: 'connect_calendar',
    label: 'Connect your calendar',
    description: 'Let RecruiterStack schedule interviews on your Google or Outlook calendar.',
    href: '/settings?tab=integrations',
    audience: 'personal',
  },
]

/** Booleans the server computes from real data; one per step. */
export interface OnboardingSignals {
  hasDepartment:       boolean
  hasLocation:         boolean
  hasRequisitionChain: boolean
  hasJobChain:         boolean
  hasRequisition:      boolean
  hasOpenJob:          boolean
  hasTeammate:         boolean
  hasCalendar:         boolean
}

export interface OnboardingStepState extends OnboardingStepMeta {
  done: boolean
}

const DONE_BY_KEY: Record<OnboardingStepKey, (s: OnboardingSignals) => boolean> = {
  departments:                s => s.hasDepartment,
  locations:                  s => s.hasLocation,
  approval_chain_requisition: s => s.hasRequisitionChain,
  approval_chain_job:         s => s.hasJobChain,
  first_requisition:          s => s.hasRequisition,
  first_job_open:             s => s.hasOpenJob,
  invite_teammate:            s => s.hasTeammate,
  connect_calendar:           s => s.hasCalendar,
}

/**
 * Pure: turn signals + the viewer's admin-ness into the steps they should see.
 * Non-admins only see 'personal' steps (their own calendar); admins see all.
 */
export function deriveSteps(signals: OnboardingSignals, isAdmin: boolean): OnboardingStepState[] {
  return ONBOARDING_STEPS
    .filter(step => isAdmin || step.audience === 'personal')
    .map(step => ({ ...step, done: DONE_BY_KEY[step.key](signals) }))
}

/** CTA route for a step key (used by the notification bell to make nudges clickable). */
export function stepHref(key: string): string | null {
  return ONBOARDING_STEPS.find(s => s.key === key)?.href ?? null
}
