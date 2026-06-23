import { describe, it, expect } from 'vitest'
import { deriveSteps, ONBOARDING_STEPS, stepHref, type OnboardingSignals } from '../checklist-steps'

const NONE: OnboardingSignals = {
  hasDepartment: false,
  hasLocation: false,
  hasRequisitionChain: false,
  hasJobChain: false,
  hasRequisition: false,
  hasOpenJob: false,
  hasTeammate: false,
  hasCalendar: false,
}

describe('deriveSteps', () => {
  it('shows org + personal steps to admins, all undone when nothing is set up', () => {
    const steps = deriveSteps(NONE, true)
    expect(steps).toHaveLength(ONBOARDING_STEPS.length)
    expect(steps.every(s => !s.done)).toBe(true)
  })

  it('shows only personal steps to non-admins', () => {
    const steps = deriveSteps(NONE, false)
    expect(steps.every(s => s.audience === 'personal')).toBe(true)
    expect(steps.map(s => s.key)).toEqual(['connect_calendar'])
  })

  it('maps each signal to the matching step done state', () => {
    const signals: OnboardingSignals = { ...NONE, hasDepartment: true, hasJobChain: true, hasOpenJob: true }
    const byKey = Object.fromEntries(deriveSteps(signals, true).map(s => [s.key, s.done]))
    expect(byKey.departments).toBe(true)
    expect(byKey.approval_chain_job).toBe(true)
    expect(byKey.first_job_open).toBe(true)
    // untouched signals stay false
    expect(byKey.locations).toBe(false)
    expect(byKey.approval_chain_requisition).toBe(false)
    expect(byKey.connect_calendar).toBe(false)
  })

  it('connect_calendar reflects the personal calendar signal for both roles', () => {
    const signals: OnboardingSignals = { ...NONE, hasCalendar: true }
    expect(deriveSteps(signals, false)[0].done).toBe(true)
    expect(deriveSteps(signals, true).find(s => s.key === 'connect_calendar')?.done).toBe(true)
  })

  it('teammate step keys resolve to a real CTA route', () => {
    expect(stepHref('invite_teammate')).toBe('/settings?tab=team')
    expect(stepHref('nonexistent')).toBeNull()
  })
})
