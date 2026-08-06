import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockSupabase } from '@/test/helpers'

vi.mock('@/lib/supabase/server', () => ({
  createAdminClient: vi.fn(),
}))

import { createAdminClient } from '@/lib/supabase/server'
import { resolveSlackUser, resolveSlackUserIdByEmail } from '@/lib/slack/identity'

describe('resolveSlackUser (inbound: Slack user → RS user)', () => {
  let mock: ReturnType<typeof createMockSupabase>

  beforeEach(() => {
    mock = createMockSupabase()
    vi.mocked(createAdminClient).mockReturnValue(mock.client as never)
    // Org install found by Slack team id, with a usable bot token.
    // (getOrgBySlackTeam selects with .limit(1), so a list.)
    mock.results.set('org_settings', {
      data: [{ org_id: 'org_1', slack_bot_token: 'xoxb-test' }], error: null,
    })
    global.fetch = vi.fn() as never
  })

  it('returns the cached mapping without calling Slack', async () => {
    mock.results.set('slack_user_map', { data: { user_id: 'u1', email: 'a@b.com' }, error: null })

    const res = await resolveSlackUser('T1', 'U1')

    expect(res).toEqual({ orgId: 'org_1', userId: 'u1', email: 'a@b.com' })
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('falls back to a live users.info lookup on a cache miss', async () => {
    mock.results.set('slack_user_map', { data: null, error: null }) // miss (+ upsert no-op)
    mock.results.set('users', { data: [{ id: 'u1' }], error: null })
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      json: async () => ({ ok: true, user: { profile: { email: 'a@b.com' } } }),
    })

    const res = await resolveSlackUser('T1', 'U1')

    expect(res).toEqual({ orgId: 'org_1', userId: 'u1', email: 'a@b.com' })
    expect(global.fetch).toHaveBeenCalledTimes(1)
    expect(String((global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0])).toContain('users.info')
  })

  it('picks the user who belongs to the Slack-linked org when emails collide', async () => {
    mock.results.set('slack_user_map', { data: null, error: null })
    // Same email exists as two user rows (dual Clerk dev/prod instances).
    mock.results.set('users', { data: [{ id: 'u_other_org' }, { id: 'u_this_org' }], error: null })
    // Only u_this_org is a member of the org that owns the Slack install.
    mock.results.set('org_members', { data: [{ user_id: 'u_this_org' }], error: null })
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      json: async () => ({ ok: true, user: { profile: { email: 'a@b.com' } } }),
    })

    const res = await resolveSlackUser('T1', 'U1')
    expect(res?.userId).toBe('u_this_org')
  })

  it('returns null when the Slack email maps to no RecruiterStack user', async () => {
    mock.results.set('slack_user_map', { data: null, error: null })
    mock.results.set('users', { data: [], error: null })
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      json: async () => ({ ok: true, user: { profile: { email: 'ghost@b.com' } } }),
    })

    expect(await resolveSlackUser('T1', 'U1')).toBeNull()
  })

  it('returns null when the team has no Slack install', async () => {
    mock.results.set('org_settings', { data: null, error: null })
    expect(await resolveSlackUser('T1', 'U1')).toBeNull()
  })
})

describe('resolveSlackUserIdByEmail (outbound: email → Slack user id)', () => {
  let mock: ReturnType<typeof createMockSupabase>

  beforeEach(() => {
    mock = createMockSupabase()
    vi.mocked(createAdminClient).mockReturnValue(mock.client as never)
    mock.results.set('org_settings', {
      data: { org_id: 'org_1', slack_bot_token: 'xoxb-test' }, error: null,
    })
    global.fetch = vi.fn() as never
  })

  it('returns the cached Slack user id without calling Slack', async () => {
    mock.results.set('slack_user_map', { data: { slack_user_id: 'U9' }, error: null })

    expect(await resolveSlackUserIdByEmail('org_1', 'a@b.com')).toBe('U9')
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('does a live users.lookupByEmail on a cache miss', async () => {
    mock.results.set('slack_user_map', { data: null, error: null })
    mock.results.set('users', { data: [{ id: 'u1' }], error: null })
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      json: async () => ({ ok: true, user: { id: 'U9' } }),
    })

    expect(await resolveSlackUserIdByEmail('org_1', 'a@b.com')).toBe('U9')
    expect(String((global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0])).toContain('users.lookupByEmail')
  })
})
