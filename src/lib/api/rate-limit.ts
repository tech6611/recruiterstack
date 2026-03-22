import { NextResponse } from 'next/server'
import { Ratelimit } from '@upstash/ratelimit'
import { getRedis } from '@/lib/api/cache'
import { logger } from '@/lib/logger'

let ratelimit: Ratelimit | null = null

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
