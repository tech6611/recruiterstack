import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockSupabase } from '@/test/helpers'

vi.mock('@/lib/supabase/server', () => ({ createAdminClient: vi.fn() }))
vi.mock('@/lib/notifications', () => ({ notifySlack: vi.fn(), notifySlackDM: vi.fn() }))
vi.mock('@/lib/slack/client', () => ({ chatPostMessage: vi.fn() }))
vi.mock('@/modules/ats/domain/applications', () => ({ getApplicationCandidateIdAndJob: vi.fn() }))

import { createAdminClient } from '@/lib/supabase/server'
import { notifySlack } from '@/lib/notifications'
import { chatPostMessage } from '@/lib/slack/client'
import { getApplicationCandidateIdAndJob } from '@/modules/ats/domain/applications'
import { dispatchSlackEvent } from '@/lib/slack/dispatch'

// candidate_applied default routing = { channel: true, dm_roles: [] } → only the
// channel path runs, keeping these tests focused on the channel-vs-webhook choice.
describe('dispatchSlackEvent — channel posting', () => {
  let mock: ReturnType<typeof createMockSupabase>

  beforeEach(() => {
    vi.clearAllMocks()
    mock = createMockSupabase()
    vi.mocked(createAdminClient).mockReturnValue(mock.client as never)
    vi.mocked(getApplicationCandidateIdAndJob).mockResolvedValue({
      data: { candidate_id: 'c1' }, error: null,
    } as never)
    vi.mocked(chatPostMessage).mockResolvedValue({ ok: true, ts: '111.222' } as never)
  })

  it('posts to the chosen channel via bot token (rich blocks), not the webhook', async () => {
    mock.results.set('org_settings', {
      data: { slack_routing: null, slack_channel_id: 'C123', slack_bot_token: 'xoxb' }, error: null,
    })
    mock.results.set('slack_channel_messages', { data: null, error: null }) // no anchor yet

    await dispatchSlackEvent({ orgId: 'org_1', event: 'candidate_applied', text: 'hi', applicationId: 'app-1' })

    expect(chatPostMessage).toHaveBeenCalledTimes(1)
    const args = vi.mocked(chatPostMessage).mock.calls[0][1]
    expect(args.channel).toBe('C123')
    expect(Array.isArray(args.blocks)).toBe(true)
    expect(args.thread_ts).toBeUndefined() // first post → no thread
    expect(notifySlack).not.toHaveBeenCalled()
  })

  it('falls back to the webhook when no channel is chosen', async () => {
    mock.results.set('org_settings', {
      data: { slack_routing: null, slack_channel_id: null, slack_bot_token: 'xoxb' }, error: null,
    })

    await dispatchSlackEvent({ orgId: 'org_1', event: 'candidate_applied', text: 'hi', applicationId: 'app-1' })

    expect(notifySlack).toHaveBeenCalledWith('org_1', 'hi')
    expect(chatPostMessage).not.toHaveBeenCalled()
  })

  it('falls back to the webhook when Slack is not connected (no bot token)', async () => {
    mock.results.set('org_settings', {
      data: { slack_routing: null, slack_channel_id: 'C123', slack_bot_token: null }, error: null,
    })

    await dispatchSlackEvent({ orgId: 'org_1', event: 'candidate_applied', text: 'hi', applicationId: 'app-1' })

    expect(notifySlack).toHaveBeenCalledWith('org_1', 'hi')
    expect(chatPostMessage).not.toHaveBeenCalled()
  })

  it('threads a follow-up event under the candidate’s first channel message', async () => {
    mock.results.set('org_settings', {
      data: { slack_routing: null, slack_channel_id: 'C123', slack_bot_token: 'xoxb' }, error: null,
    })
    // An anchor already exists for this application.
    mock.results.set('slack_channel_messages', { data: { ts: '999.888' }, error: null })

    await dispatchSlackEvent({ orgId: 'org_1', event: 'candidate_applied', text: 'moved', applicationId: 'app-1' })

    const args = vi.mocked(chatPostMessage).mock.calls[0][1]
    expect(args.thread_ts).toBe('999.888')
  })
})
