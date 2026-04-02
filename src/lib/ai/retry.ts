import { logger } from '@/lib/logger'

/** Transient HTTP status codes worth retrying */
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 529])

interface RetryOptions {
  maxRetries?: number
  label?: string
}

/**
 * Wrap an async function with exponential backoff retry.
 * Only retries on transient errors (429, 500, 502, 503, 529).
 * Does NOT retry client errors (400, 401, 403, 404).
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: RetryOptions = {},
): Promise<T> {
  const { maxRetries = 3, label = 'AI' } = opts

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (err: unknown) {
      const isLast = attempt === maxRetries

      // Check if error has a status code (Anthropic SDK errors)
      const status = (err as { status?: number })?.status
      const isRetryable = status ? RETRYABLE_STATUSES.has(status) : isNetworkError(err)

      if (isLast || !isRetryable) {
        throw err
      }

      const delayMs = Math.pow(2, attempt) * 1000 // 1s, 2s, 4s
      logger.warn(`${label}: retrying after error (attempt ${attempt + 1}/${maxRetries})`, {
        status,
        delay: delayMs,
        error: err instanceof Error ? err.message : String(err),
      })

      await sleep(delayMs)
    }
  }

  // Unreachable, but TypeScript needs it
  throw new Error(`${label}: exhausted all retries`)
}

function isNetworkError(err: unknown): boolean {
  if (err instanceof Error) {
    const msg = err.message.toLowerCase()
    return msg.includes('fetch') || msg.includes('network') || msg.includes('econnreset') || msg.includes('timeout')
  }
  return false
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
