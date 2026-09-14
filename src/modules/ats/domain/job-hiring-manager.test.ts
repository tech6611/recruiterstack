import { describe, it, expect } from 'vitest'
import { pickHiringManagerForJob } from './job-hiring-manager'

describe('pickHiringManagerForJob', () => {
  it('copies the requisition HM when the job has none', () => {
    expect(pickHiringManagerForJob({ currentJobHm: null, openingHm: 'u-hm' })).toBe('u-hm')
    expect(pickHiringManagerForJob({ currentJobHm: undefined, openingHm: 'u-hm' })).toBe('u-hm')
  })
  it('never overwrites an HM already set on the job (picker override wins)', () => {
    expect(pickHiringManagerForJob({ currentJobHm: 'u-existing', openingHm: 'u-hm' })).toBeNull()
  })
  it('does nothing when the requisition names no HM', () => {
    expect(pickHiringManagerForJob({ currentJobHm: null, openingHm: null })).toBeNull()
    expect(pickHiringManagerForJob({ currentJobHm: null, openingHm: '' })).toBeNull()
  })
})
