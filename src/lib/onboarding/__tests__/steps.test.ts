import { describe, it, expect } from 'vitest'
import { stepsForRole, nextStep, prevStep, STEPS } from '../steps'

describe('onboarding step resolution', () => {
  it('admin and pending-admin see all steps', () => {
    const admin   = stepsForRole('admin').map(s => s.slug)
    const pending = stepsForRole('pending-admin').map(s => s.slug)
    expect(admin).toEqual(STEPS.map(s => s.slug))
    expect(pending).toEqual(admin)
  })

  it('member skips admin-only steps', () => {
    const member = stepsForRole('member').map(s => s.slug)
    expect(member).toEqual(['profile', 'role', 'integrations', 'done'])
    expect(member).not.toContain('org-info')
    expect(member).not.toContain('modules')
    expect(member).not.toContain('invites')
  })

  it('nextStep returns the next slug in admin sequence', () => {
    expect(nextStep('profile',      'admin')).toBe('role')
    expect(nextStep('role',         'admin')).toBe('org-info')
    expect(nextStep('org-info',     'admin')).toBe('modules')
    expect(nextStep('modules',      'admin')).toBe('invites')
    expect(nextStep('invites',      'admin')).toBe('integrations')
    expect(nextStep('integrations', 'admin')).toBe('done')
    expect(nextStep('done',         'admin')).toBeNull()
  })

  it('nextStep skips admin-only steps for members', () => {
    expect(nextStep('role',         'member')).toBe('integrations')
    expect(nextStep('integrations', 'member')).toBe('done')
  })

  it('prevStep is the inverse for the middle of the sequence', () => {
    expect(prevStep('role',         'admin')).toBe('profile')
    expect(prevStep('integrations', 'admin')).toBe('invites')
    expect(prevStep('integrations', 'member')).toBe('role')
    expect(prevStep('profile',      'admin')).toBeNull()
  })
})
