import { describe, it, expect } from 'vitest'
import { diffRoles } from './roles'

describe('diffRoles', () => {
  it('reports each role whose holder changed, including additions and removals', () => {
    const before = { hiring_manager_id: 'a', recruiter_id: 'r', coordinator_id: null, sourcer_id: 's' }
    const after  = { hiring_manager_id: 'b', recruiter_id: 'r', coordinator_id: 'c', sourcer_id: null }
    expect(diffRoles(before, after)).toEqual([
      { role: 'hiring_manager_id', from: 'a', to: 'b' },
      { role: 'coordinator_id', from: null, to: 'c' },
      { role: 'sourcer_id', from: 's', to: null },
    ])
  })
  it('treats undefined and null as the same (no change)', () => {
    expect(diffRoles({ coordinator_id: undefined }, { coordinator_id: null })).toEqual([])
  })
})
