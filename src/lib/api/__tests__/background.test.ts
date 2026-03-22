import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock Sentry
vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
}))

import { runInBackground } from '../background'
import * as Sentry from '@sentry/nextjs'

describe('runInBackground', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('executes the provided function', async () => {
    const fn = vi.fn().mockResolvedValue(undefined)

    runInBackground(fn)

    // Give the fire-and-forget promise time to resolve
    await new Promise(r => setTimeout(r, 10))
    expect(fn).toHaveBeenCalledOnce()
  })

  it('catches and logs errors without throwing', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('task failed'))

    // Should not throw
    runInBackground(fn)

    await new Promise(r => setTimeout(r, 10))
    expect(fn).toHaveBeenCalledOnce()
    expect(Sentry.captureException).toHaveBeenCalledWith(expect.any(Error))
  })

  it('handles synchronous errors in the function', async () => {
    const fn = vi.fn().mockImplementation(() => {
      throw new Error('sync error')
    })

    runInBackground(fn)

    await new Promise(r => setTimeout(r, 10))
    expect(Sentry.captureException).toHaveBeenCalledWith(expect.any(Error))
  })
})
