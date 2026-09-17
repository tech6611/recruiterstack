import { describe, it, expect } from 'vitest'
import { resolveEventDisplayFields, isUuid, isClerkUserId } from './event-display'

const STAGE_A = 'fa37baa8-62dd-4e8f-a63e-f7ad06bac04d'
const STAGE_B = '72774910-c06c-475a-9fd7-4cf39e5e962a'

/** Minimal fake of the two lookups the resolver performs. */
function fakeSb(stages: Array<{ id: string; name: string }>, users: Array<{ clerk_user_id: string; full_name: string | null; first_name?: string | null; last_name?: string | null; email?: string | null }>) {
  const calls: string[] = []
  return {
    calls,
    from(table: string) {
      calls.push(table)
      return {
        select() {
          return {
            in(_col: string, ids: string[]) {
              if (table === 'pipeline_stages') return Promise.resolve({ data: stages.filter(s => ids.includes(s.id)) })
              if (table === 'users') return Promise.resolve({ data: users.filter(u => ids.includes(u.clerk_user_id)) })
              return Promise.resolve({ data: [] })
            },
          }
        },
      }
    },
  }
}

describe('resolveEventDisplayFields', () => {
  it('replaces stage UUIDs with stage names and Clerk ids with full names', async () => {
    const sb = fakeSb(
      [{ id: STAGE_A, name: 'Applied' }, { id: STAGE_B, name: 'Phone Screen' }],
      [{ clerk_user_id: 'user_abc', full_name: 'Sagar Kumar' }],
    )
    const events = [
      { from_stage: STAGE_A, to_stage: STAGE_B, created_by: 'automation' },
      { from_stage: null, to_stage: null, created_by: 'user_abc' },
    ]
    await resolveEventDisplayFields(sb, events)
    expect(events[0]).toEqual({ from_stage: 'Applied', to_stage: 'Phone Screen', created_by: 'automation' })
    expect(events[1].created_by).toBe('Sagar Kumar')
  })

  it('leaves already-readable rows untouched and skips the DB entirely', async () => {
    const sb = fakeSb([], [])
    const events = [{ from_stage: 'Applied', to_stage: 'Interview', created_by: 'Recruiter' }]
    await resolveEventDisplayFields(sb, events)
    expect(events[0]).toEqual({ from_stage: 'Applied', to_stage: 'Interview', created_by: 'Recruiter' })
    expect(sb.calls).toEqual([])
  })

  it('keeps ids it cannot resolve (deleted stage / unknown user) rather than blanking them', async () => {
    const sb = fakeSb([], [{ clerk_user_id: 'user_x', full_name: null, first_name: 'Ada', last_name: 'Lovelace' }])
    const events = [{ from_stage: STAGE_A, to_stage: null, created_by: 'user_x' }, { from_stage: null, to_stage: null, created_by: 'user_gone' }]
    await resolveEventDisplayFields(sb, events)
    expect(events[0].from_stage).toBe(STAGE_A)
    expect(events[0].created_by).toBe('Ada Lovelace')
    expect(events[1].created_by).toBe('user_gone')
  })

  it('id predicates', () => {
    expect(isUuid(STAGE_A)).toBe(true)
    expect(isUuid('Applied')).toBe(false)
    expect(isClerkUserId('user_abc')).toBe(true)
    expect(isClerkUserId('Recruiter')).toBe(false)
  })
})
