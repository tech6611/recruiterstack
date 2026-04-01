import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock cache module — return null Redis so rate limiting gracefully skips
vi.mock('@/lib/api/cache', () => ({
  getRedis: vi.fn(() => null),
}))

import { checkAuthRateLimit } from '@/lib/api/rate-limit'

describe('checkAuthRateLimit', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns null (allows request) when Redis is not configured', async () => {
    const result = await checkAuthRateLimit('org_123')

    expect(result).toBeNull()
  })

  it('returns null with custom options when Redis is not configured', async () => {
    const result = await checkAuthRateLimit('org_123', { maxRequests: 10, window: '30 s' })

    expect(result).toBeNull()
  })

  it('accepts identifier as string', async () => {
    // Should not throw
    const result = await checkAuthRateLimit('any-identifier-string')
    expect(result).toBeNull()
  })
})
