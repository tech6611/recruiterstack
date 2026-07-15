import { describe, it, expect } from 'vitest'
import { DEFAULT_SLACK_ROUTING, resolveEventRouting } from '@/lib/slack/routing'
import { orgSettingsUpdateSchema } from '@/lib/validations/org-settings'
import type { SlackRouting } from '@/lib/types/database'

describe('resolveEventRouting', () => {
  it('falls back to the built-in default when config is null/undefined', () => {
    expect(resolveEventRouting(null, 'stage_moved')).toEqual({ channel: true, dm_roles: ['hiring_manager'] })
    expect(resolveEventRouting(undefined, 'candidate_applied')).toEqual({ channel: true, dm_roles: [] })
  })

  it('falls back per-event when the stored config omits that event', () => {
    const routing: SlackRouting = { candidate_applied: { channel: false, dm_roles: [] } }
    // configured event wins
    expect(resolveEventRouting(routing, 'candidate_applied')).toEqual({ channel: false, dm_roles: [] })
    // omitted event still uses the default
    expect(resolveEventRouting(routing, 'candidate_hired')).toEqual(DEFAULT_SLACK_ROUTING.candidate_hired)
  })

  it('returns the stored rule verbatim when present', () => {
    const rule: SlackRouting['stage_moved'] = { channel: true, dm_roles: ['recruiter', 'hiring_manager'] }
    expect(resolveEventRouting({ stage_moved: rule }, 'stage_moved')).toEqual(rule)
  })

  it('defaults reproduce pre-hub behaviour', () => {
    expect(DEFAULT_SLACK_ROUTING).toEqual({
      candidate_applied: { channel: true, dm_roles: [] },
      stage_moved:       { channel: true, dm_roles: ['hiring_manager'] },
      candidate_hired:   { channel: true, dm_roles: ['hiring_manager'] },
    })
  })
})

describe('orgSettingsUpdateSchema — slack_routing', () => {
  it('accepts a valid partial routing config', () => {
    const parsed = orgSettingsUpdateSchema.safeParse({
      slack_routing: {
        candidate_applied: { channel: true, dm_roles: [] },
        stage_moved: { channel: false, dm_roles: ['recruiter', 'hiring_manager'] },
      },
    })
    expect(parsed.success).toBe(true)
  })

  it('rejects an unknown DM role', () => {
    const parsed = orgSettingsUpdateSchema.safeParse({
      slack_routing: { stage_moved: { channel: true, dm_roles: ['ceo'] } },
    })
    expect(parsed.success).toBe(false)
  })

  it('rejects a non-boolean channel flag', () => {
    const parsed = orgSettingsUpdateSchema.safeParse({
      slack_routing: { stage_moved: { channel: 'yes', dm_roles: [] } },
    })
    expect(parsed.success).toBe(false)
  })

  it('rejects an unknown event key', () => {
    const parsed = orgSettingsUpdateSchema.safeParse({
      slack_routing: { some_other_event: { channel: true, dm_roles: [] } },
    })
    // zod objects strip unknown keys by default rather than erroring, so the
    // parse succeeds but the stray key is dropped — assert it's gone.
    expect(parsed.success).toBe(true)
    if (parsed.success) {
      expect(parsed.data.slack_routing).toEqual({})
    }
  })
})
