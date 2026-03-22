import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock Upstash before importing
vi.mock('@upstash/ratelimit', () => ({
  Ratelimit: vi.fn().mockImplementation(() => ({
    limit: vi.fn(),
  })),
}))

vi.mock('@upstash/redis', () => ({
  Redis: {
    fromEnv: vi.fn(),
  },
}))

// Must import after mocks are set up
import { checkRateLimit } from '../rate-limit'

beforeEach(() => {
  vi.clearAllMocks()
  // Reset module state
  vi.resetModules()
})

describe('checkRateLimit', () => {
  it('returns null (allows) when Upstash is not configured', async () => {
    // No env vars set — should gracefully skip
    delete process.env.UPSTASH_REDIS_REST_URL
    delete process.env.UPSTASH_REDIS_REST_TOKEN

    // Re-import to get fresh module state
    const { checkRateLimit: freshCheck } = await import('../rate-limit')
    const req = new Request('http://localhost/api/apply', {
      headers: { 'x-forwarded-for': '1.2.3.4' },
    })
    const result = await freshCheck(req)
    expect(result).toBeNull()
  })
})
