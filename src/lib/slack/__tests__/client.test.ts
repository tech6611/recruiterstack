import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockSupabase } from '@/test/helpers'

vi.mock('@/lib/supabase/server', () => ({ createAdminClient: vi.fn() }))

import { createAdminClient } from '@/lib/supabase/server'
import { conversationsList } from '@/lib/slack/client'

describe('conversationsList', () => {
  let mock: ReturnType<typeof createMockSupabase>

  beforeEach(() => {
    mock = createMockSupabase()
    vi.mocked(createAdminClient).mockReturnValue(mock.client as never)
    mock.results.set('org_settings', { data: { slack_bot_token: 'xoxb' }, error: null })
    global.fetch = vi.fn() as never
  })

  it('returns the workspace public channels sorted by name', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      json: async () => ({ ok: true, channels: [{ id: 'C2', name: 'zeta' }, { id: 'C1', name: 'alpha' }] }),
    })

    const res = await conversationsList('org_1')

    expect(res).toEqual([{ id: 'C1', name: 'alpha' }, { id: 'C2', name: 'zeta' }])
    expect(String((global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0])).toContain('conversations.list')
  })

  it('returns [] and does not call Slack when not connected', async () => {
    mock.results.set('org_settings', { data: { slack_bot_token: null }, error: null })

    expect(await conversationsList('org_1')).toEqual([])
    expect(global.fetch).not.toHaveBeenCalled()
  })
})
