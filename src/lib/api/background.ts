import * as Sentry from '@sentry/nextjs'
import { logger } from '@/lib/logger'

/**
 * Run a function in the background using Vercel's waitUntil().
 * Returns immediately so the caller can send a response without waiting.
 *
 * - On Vercel: uses `waitUntil()` from next/server to keep the function alive after response
 * - Fallback: awaits the function directly (dev/test environments)
 * - Errors are caught, logged, and reported to Sentry — never thrown
 */
export function runInBackground(fn: () => Promise<void>): void {
  const wrapped = async () => {
    try {
      await fn()
    } catch (err) {
      Sentry.captureException(err)
      logger.error('Background task failed', err)
    }
  }

  // next/server exports waitUntil in Vercel runtime
  // In dev/test, we just fire-and-forget
  try {
    // Dynamic import to avoid build errors in environments without waitUntil
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { waitUntil } = require('next/server')
    if (typeof waitUntil === 'function') {
      waitUntil(wrapped())
      return
    }
  } catch {
    // waitUntil not available — fall through to fire-and-forget
  }

  // Fire-and-forget fallback for dev/test
  void wrapped()
}
