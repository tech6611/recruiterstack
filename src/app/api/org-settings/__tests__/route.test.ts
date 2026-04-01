import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockSupabase, createMockRequest } from '@/test/helpers'
import { createAdminClient } from '@/lib/supabase/server'

// Mock cache module
vi.mock('@/lib/api/cache', () => ({
  cached: vi.fn((_key: string, _ttl: number, fn: () => unknown) => fn()),
  cacheKey: vi.fn((...args: string[]) => args.join(':')),
  invalidate: vi.fn(() => Promise.resolve()),
  getRedis: vi.fn(() => null),
}))

import { PATCH } from '../route'

describe('/api/org-settings', () => {
  let mockSupabase: ReturnType<typeof createMockSupabase>

  beforeEach(() => {
    vi.clearAllMocks()
    mockSupabase = createMockSupabase()
    vi.mocked(createAdminClient).mockReturnValue(mockSupabase.client as never)
  })

  describe('PATCH', () => {
    it('updates webhook URL with valid URL', async () => {
      const settings = { org_id: 'org_test123', slack_webhook_url: 'https://hooks.slack.com/services/xxx' }
      mockSupabase.results.set('org_settings', { data: settings, error: null })

      const req = createMockRequest('PATCH', '/api/org-settings', {
        slack_webhook_url: 'https://hooks.slack.com/services/xxx',
      })
      const res = await PATCH(req)
      const json = await res.json()

      expect(res.status).toBe(200)
      expect(json.data).toBeDefined()
    })

    it('rejects invalid URL format', async () => {
      const req = createMockRequest('PATCH', '/api/org-settings', {
        slack_webhook_url: 'not-a-url',
      })
      const res = await PATCH(req)
      const json = await res.json()

      expect(res.status).toBe(400)
      expect(json.error).toBe('Validation failed')
    })

    it('accepts null to clear webhook URL', async () => {
      const settings = { org_id: 'org_test123', slack_webhook_url: null }
      mockSupabase.results.set('org_settings', { data: settings, error: null })

      const req = createMockRequest('PATCH', '/api/org-settings', {
        slack_webhook_url: null,
      })
      const res = await PATCH(req)

      expect(res.status).toBe(200)
    })

    it('strips unknown fields', async () => {
      const settings = { org_id: 'org_test123', slack_webhook_url: null }
      mockSupabase.results.set('org_settings', { data: settings, error: null })

      const req = createMockRequest('PATCH', '/api/org-settings', {
        slack_webhook_url: null,
        slack_bot_token: 'xoxb-stolen-token',
      })
      const res = await PATCH(req)

      // Should succeed — unknown fields stripped by Zod
      expect(res.status).toBe(200)
    })
  })
})
