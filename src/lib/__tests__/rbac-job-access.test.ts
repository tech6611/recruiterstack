import { describe, it, expect } from 'vitest'
import { canViewJob, assertCanViewJob, type ViewerScope } from '@/lib/rbac'
import type { Capability } from '@/lib/permissions'

// canViewJob only reads scope.capabilities + scope.userId, so a partial scope is
// enough for these unit tests.
function scope(userId: string, caps: Capability[]): ViewerScope {
  return { userId, capabilities: new Set(caps) } as unknown as ViewerScope
}

const HM = 'user-hm'
const OTHER = 'user-other'
const jobOwnedByHM = { hiring_manager_user_id: HM }
const jobOwnedByOther = { hiring_manager_user_id: OTHER }
const jobNoHM = { hiring_manager_user_id: null }

describe('canViewJob — job-scoped read access', () => {
  it('anyone with recruiting:view can read any job (incl. one with a different HM, or no HM)', () => {
    const recruiter = scope('user-recruiter', ['recruiting:view'])
    expect(canViewJob(recruiter, jobOwnedByOther)).toBe(true)
    expect(canViewJob(recruiter, jobNoHM)).toBe(true)
    expect(canViewJob(recruiter, null)).toBe(true)
  })

  it('the assigned hiring manager can read THEIR job without recruiting:view', () => {
    const hm = scope(HM, ['openings:view', 'approvals:view', 'approvals:approve'])
    expect(canViewJob(hm, jobOwnedByHM)).toBe(true)
  })

  it('a hiring manager cannot read a job they are NOT the HM of', () => {
    const hm = scope(HM, ['openings:view', 'approvals:view', 'approvals:approve'])
    expect(canViewJob(hm, jobOwnedByOther)).toBe(false)
    expect(canViewJob(hm, jobNoHM)).toBe(false)
    expect(canViewJob(hm, null)).toBe(false)
  })

  it('assertCanViewJob returns null when allowed and a 403 when denied', () => {
    const hm = scope(HM, ['approvals:approve'])
    expect(assertCanViewJob(hm, jobOwnedByHM)).toBeNull()
    const denied = assertCanViewJob(hm, jobOwnedByOther)
    expect(denied).not.toBeNull()
    expect(denied?.status).toBe(403)
  })
})
