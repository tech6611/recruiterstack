import { Redis } from '@upstash/redis'
import { logger } from '@/lib/logger'

let redis: Redis | null = null

/**
 * Singleton Redis client. Shared with rate-limit.ts.
 * Returns null when Upstash env vars are missing.
 */
export function getRedis(): Redis | null {
  if (redis) return redis
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    return null
  }
  redis = Redis.fromEnv()
  return redis
}

/**
 * Cache-aside helper: returns cached value if present, otherwise runs fetcher and stores result.
 * Gracefully falls back to fetcher when Redis is unavailable.
 */
export async function cached<T>(key: string, ttlSeconds: number, fetcher: () => Promise<T>): Promise<T> {
  const client = getRedis()
  if (!client) return fetcher()

  try {
    const hit = await client.get<T>(key)
    if (hit !== null && hit !== undefined) {
      logger.info('Cache hit', { key })
      return hit
    }
  } catch (err) {
    logger.error('Cache read failed', err, { key })
  }

  const result = await fetcher()

  try {
    await client.set(key, JSON.stringify(result), { ex: ttlSeconds })
  } catch (err) {
    logger.error('Cache write failed', err, { key })
  }

  return result
}

/**
 * Remove a single cache key.
 */
export async function invalidate(key: string): Promise<void> {
  const client = getRedis()
  if (!client) return

  try {
    await client.del(key)
  } catch (err) {
    logger.error('Cache invalidation failed', err, { key })
  }
}

/**
 * Remove all keys matching a prefix (e.g. "cache:org_123:*").
 * Uses SCAN to avoid blocking Redis.
 */
export async function invalidatePrefix(prefix: string): Promise<void> {
  const client = getRedis()
  if (!client) return

  try {
    let cursor = 0
    do {
      const [nextCursor, keys] = await client.scan(cursor, { match: `${prefix}*`, count: 100 })
      cursor = Number(nextCursor)
      if (keys.length > 0) {
        await client.del(...keys)
      }
    } while (cursor !== 0)
  } catch (err) {
    logger.error('Cache prefix invalidation failed', err, { prefix })
  }
}

/** Build a standard cache key: cache:{orgId}:{resource} */
export function cacheKey(orgId: string, resource: string): string {
  return `cache:${orgId}:${resource}`
}
