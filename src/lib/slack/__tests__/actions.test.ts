import { describe, it, expect } from 'vitest'
import { getBlockActionHandler, getViewSubmissionHandler } from '@/lib/slack/actions'

describe('Slack action registry', () => {
  it('dispatches the registered approval buttons', () => {
    expect(typeof getBlockActionHandler('approval_approve')).toBe('function')
    expect(typeof getBlockActionHandler('approval_reject')).toBe('function')
  })

  it('dispatches the new application buttons', () => {
    expect(typeof getBlockActionHandler('app:move_stage')).toBe('function')
    expect(typeof getBlockActionHandler('app:add_note')).toBe('function')
  })

  it('ignores link buttons and unknown actions', () => {
    // 'approval_open' / 'app:open' are link buttons — intentionally unregistered.
    expect(getBlockActionHandler('approval_open')).toBeNull()
    expect(getBlockActionHandler('app:open')).toBeNull()
    expect(getBlockActionHandler('totally_unknown')).toBeNull()
  })

  it('dispatches the registered modal submits and ignores unknown ones', () => {
    expect(typeof getViewSubmissionHandler('approval_reject_modal')).toBe('function')
    expect(typeof getViewSubmissionHandler('app:add_note_modal')).toBe('function')
    expect(getViewSubmissionHandler('unknown_modal')).toBeNull()
  })
})
