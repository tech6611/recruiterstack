import { describe, it, expect } from 'vitest'
import { classifyOutcome } from './learning-signals'

describe('classifyOutcome', () => {
  it('a declined offer is a movability signal (beats everything)', () => {
    expect(classifyOutcome({ offer_status: 'declined', review_status: 'yes' })).toBe('declined_offer')
  })
  it('an accepted offer is a hire', () => {
    expect(classifyOutcome({ offer_status: 'accepted' })).toBe('hired')
  })
  it('a recruiter "no" is a fit miss (even if they replied)', () => {
    expect(classifyOutcome({ review_status: 'no', enrolled: true, replied: true })).toBe('fit_miss')
  })
  it('enrolled, never replied, sequence ran out = reachability (no_reply)', () => {
    expect(classifyOutcome({ enrolled: true, replied: false, enrollment_terminal: true, review_status: 'unreviewed' })).toBe('no_reply')
  })
  it('still enrolled (not terminal) and unreviewed = pending, not a reachability miss', () => {
    expect(classifyOutcome({ enrolled: true, replied: false, enrollment_terminal: false, review_status: 'unreviewed' })).toBe('pending')
  })
  it('a "yes" that hasn\'t reached offer = advanced', () => {
    expect(classifyOutcome({ review_status: 'yes' })).toBe('advanced')
  })
})
