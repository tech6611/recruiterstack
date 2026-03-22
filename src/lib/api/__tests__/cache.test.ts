import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock Redis before importing cache module
const mockGet = vi.fn()
const mockSet = vi.fn()
const mockDel = vi.fn()
const mockScan = vi.fn()

vi.mock('@upstash/redis', () => ({
  Redis: {
    fromEnv: vi.fn(() => ({
      get: mockGet,
      set: mockSet,
      del: mockDel,
      scan: mockScan,
    })),
  },
}))

// Must import after mocking
import { cached, invalidate, invalidatePrefix, cacheKey } from '../cache'

describe('cache', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Set env vars so getRedis() returns a client
    process.env.UPSTASH_REDIS_REST_URL = 'https://test.upstash.io'
    process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token'
  })

  describe('cacheKey', () => {
    it('builds key with org and resource', () => {
      expect(cacheKey('org_123', 'dashboard')).toBe('cache:org_123:dashboard')
    })
  })

  describe('cached()', () => {
    it('returns cached value on hit', async () => {
      mockGet.mockResolvedValueOnce({ stats: { total: 5 } })
      const fetcher = vi.fn()

      const result = await cached('test-key', 60, fetcher)

      expect(result).toEqual({ stats: { total: 5 } })
      expect(fetcher).not.toHaveBeenCalled()
      expect(mockGet).toHaveBeenCalledWith('test-key')
    })

    it('calls fetcher and stores result on miss', async () => {
      mockGet.mockResolvedValueOnce(null)
      mockSet.mockResolvedValueOnce('OK')
      const fetcher = vi.fn().mockResolvedValue({ data: 'fresh' })

      const result = await cached('test-key', 120, fetcher)

      expect(result).toEqual({ data: 'fresh' })
      expect(fetcher).toHaveBeenCalledOnce()
      expect(mockSet).toHaveBeenCalledWith('test-key', JSON.stringify({ data: 'fresh' }), { ex: 120 })
    })

    it('falls back to fetcher when Redis read fails', async () => {
      mockGet.mockRejectedValueOnce(new Error('Redis down'))
      mockSet.mockResolvedValueOnce('OK')
      const fetcher = vi.fn().mockResolvedValue({ fallback: true })

      const result = await cached('test-key', 60, fetcher)

      expect(result).toEqual({ fallback: true })
      expect(fetcher).toHaveBeenCalledOnce()
    })

    it('still returns result when Redis write fails', async () => {
      mockGet.mockResolvedValueOnce(null)
      mockSet.mockRejectedValueOnce(new Error('Redis write error'))
      const fetcher = vi.fn().mockResolvedValue({ data: 'ok' })

      const result = await cached('test-key', 60, fetcher)

      expect(result).toEqual({ data: 'ok' })
    })
  })

  describe('invalidate()', () => {
    it('deletes the specified key', async () => {
      mockDel.mockResolvedValueOnce(1)
      await invalidate('cache:org_1:dashboard')
      expect(mockDel).toHaveBeenCalledWith('cache:org_1:dashboard')
    })
  })

  describe('invalidatePrefix()', () => {
    it('scans and deletes matching keys', async () => {
      mockScan.mockResolvedValueOnce([0, ['cache:org_1:a', 'cache:org_1:b']])
      mockDel.mockResolvedValueOnce(2)

      await invalidatePrefix('cache:org_1:')

      expect(mockScan).toHaveBeenCalledWith(0, { match: 'cache:org_1:*', count: 100 })
      expect(mockDel).toHaveBeenCalledWith('cache:org_1:a', 'cache:org_1:b')
    })
  })
})
