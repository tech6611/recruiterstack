import { NextResponse } from 'next/server'
import { type Duration, Ratelimit } from '@upstash/ratelimit'
import { getRedis } from '@/lib/api/cache'
import { logger } from '@/lib/logger'

let ratelimit: Ratelimit | null = null
const authRatelimiters: Map<string, Ratelimit> = new Map()

function getRatelimit(): Ratelimit | null {
  if (ratelimit) return ratelimit
  const redis = getRedis()
  if (!redis) return null
  ratelimit = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(10, '60 s'),
    analytics: true,
  })
  return ratelimit
}

function getAuthRatelimit(maxRequests: number, window: Duration): Ratelimit | null {
  const key = `${maxRequests}:${window}`
  const cached = authRatelimiters.get(key)
  if (cached) return cached
  const redis = getRedis()
  if (!redis) return null
  const limiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(maxRequests, window),
    analytics: true,
    prefix: 'rl:auth',
  })
  authRatelimiters.set(key, limiter)
  return limiter
}

/**
 * Check rate limit for a request. Returns null if allowed, or a 429 NextResponse if blocked.
 * Gracefully skips if Upstash is not configured.
 */
export async function checkRateLimit(request: Request): Promise<NextResponse | null> {
  const limiter = getRatelimit()
  if (!limiter) return null

  const forwarded = request.headers.get('x-forwarded-for')
  const ip = forwarded?.split(',')[0]?.trim() ?? '127.0.0.1'

  try {
    const { success, limit, remaining, reset } = await limiter.limit(ip)
    if (!success) {
      logger.warn('Rate limit exceeded', { ip, limit, reset })
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        {
          status: 429,
          headers: {
            'X-RateLimit-Limit': String(limit),
            'X-RateLimit-Remaining': String(remaining),
            'X-RateLimit-Reset': String(reset),
            'Retry-After': String(Math.ceil((reset - Date.now()) / 1000)),
          },
        },
      )
    }
  } catch (err) {
    // Don't block requests if rate limiting fails
    logger.error('Rate limit check failed', err)
  }

  return null
}

/**
 * Check rate limit for authenticated endpoints using orgId or userId as identifier.
 * Defaults to 30 requests per 60 seconds. Returns null if allowed, or a 429 NextResponse if blocked.
 * Gracefully skips if Upstash is not configured.
 */
export async function checkAuthRateLimit(
  identifier: string,
  opts: { maxRequests?: number; window?: Duration } = {},
): Promise<NextResponse | null> {
  const { maxRequests = 30, window = '60 s' as Duration } = opts
  const limiter = getAuthRatelimit(maxRequests, window)
  if (!limiter) return null

  try {
    const { success, limit, remaining, reset } = await limiter.limit(identifier)
    if (!success) {
      logger.warn('Auth rate limit exceeded', { identifier, limit, reset })
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        {
          status: 429,
          headers: {
            'X-RateLimit-Limit': String(limit),
            'X-RateLimit-Remaining': String(remaining),
            'X-RateLimit-Reset': String(reset),
            'Retry-After': String(Math.ceil((reset - Date.now()) / 1000)),
          },
        },
      )
    }
  } catch (err) {
    logger.error('Auth rate limit check failed', err)
  }

  return null
}
