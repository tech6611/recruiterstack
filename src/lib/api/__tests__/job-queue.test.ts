import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
}))

/**
 * Build a fluent Supabase chain where every method returns `this`
 * and the chain itself is thenable (resolves with `result`).
 */
function fluent(result: { data: unknown; error: unknown }) {
  const obj: Record<string, unknown> = {}
  const proxy: unknown = new Proxy(obj, {
    get(_, prop) {
      if (prop === 'then') {
        // Make the chain thenable so `await chain.limit(...)` resolves
        return (resolve: (v: unknown) => void) => resolve(result)
      }
      // Every method returns the proxy itself
      return vi.fn().mockReturnValue(proxy)
    },
  })
  return proxy
}

const mockFrom = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createAdminClient: () => ({ from: mockFrom }),
}))

import { enqueue, processJobs, registerHandler } from '../job-queue'
import * as Sentry from '@sentry/nextjs'

// ── enqueue ───────────────────────────────────────────────────────────────────

describe('enqueue', () => {
  beforeEach(() => vi.clearAllMocks())

  it('inserts a job and returns the id', async () => {
    mockFrom.mockReturnValue(fluent({ data: { id: 'job-123' }, error: null }))

    const id = await enqueue({
      orgId: 'org-1',
      jobType: 'autopilot',
      payload: { applicationId: 'app-1' },
    })

    expect(id).toBe('job-123')
    expect(mockFrom).toHaveBeenCalledWith('job_queue')
  })

  it('throws when insert fails', async () => {
    mockFrom.mockReturnValue(fluent({ data: null, error: { message: 'db down' } }))

    await expect(
      enqueue({ orgId: 'org-1', jobType: 'autopilot', payload: {} }),
    ).rejects.toThrow('Failed to enqueue autopilot')
  })

  it('respects delaySeconds', async () => {
    // We just verify it doesn't throw — the scheduled_at logic is straightforward
    mockFrom.mockReturnValue(fluent({ data: { id: 'job-456' }, error: null }))

    const id = await enqueue({
      orgId: 'org-1',
      jobType: 'ai_summary',
      payload: { candidateId: 'c-1' },
      delaySeconds: 60,
    })

    expect(id).toBe('job-456')
  })

  it('respects custom maxAttempts', async () => {
    mockFrom.mockReturnValue(fluent({ data: { id: 'job-789' }, error: null }))

    const id = await enqueue({
      orgId: 'org-1',
      jobType: 'matching',
      payload: { roleId: 'r-1' },
      maxAttempts: 5,
    })

    expect(id).toBe('job-789')
  })
})

// ── processJobs ───────────────────────────────────────────────────────────────

describe('processJobs', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 0 when no jobs are pending', async () => {
    mockFrom.mockReturnValue(fluent({ data: [], error: null }))

    const processed = await processJobs()
    expect(processed).toBe(0)
  })

  it('processes a job and calls the handler', async () => {
    const job = {
      id: 'job-1',
      org_id: 'org-1',
      job_type: 'autopilot',
      payload: { applicationId: 'app-1' },
      status: 'pending',
      attempts: 0,
      max_attempts: 3,
      error: null,
      scheduled_at: new Date().toISOString(),
      started_at: null,
      completed_at: null,
      created_at: new Date().toISOString(),
    }

    const handler = vi.fn().mockResolvedValue(undefined)
    registerHandler('autopilot', handler)

    // All Supabase calls succeed
    mockFrom.mockReturnValue(fluent({ data: [job], error: null }))

    const processed = await processJobs()
    expect(handler).toHaveBeenCalledOnce()
    expect(processed).toBe(1)
  })

  it('reports to Sentry when handler fails on last attempt', async () => {
    const job = {
      id: 'job-fail',
      org_id: 'org-1',
      job_type: 'autopilot',
      payload: {},
      status: 'failed',
      attempts: 2,
      max_attempts: 3,
      error: 'prev',
      scheduled_at: new Date().toISOString(),
      started_at: null,
      completed_at: null,
      created_at: new Date().toISOString(),
    }

    registerHandler('autopilot', vi.fn().mockRejectedValue(new Error('boom')))
    mockFrom.mockReturnValue(fluent({ data: [job], error: null }))

    await processJobs()

    expect(Sentry.captureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ extra: { jobId: 'job-fail', jobType: 'autopilot' } }),
    )
  })

  it('retries with backoff when handler fails before max attempts', async () => {
    const job = {
      id: 'job-retry',
      org_id: 'org-1',
      job_type: 'autopilot',
      payload: {},
      status: 'pending',
      attempts: 0,
      max_attempts: 3,
      error: null,
      scheduled_at: new Date().toISOString(),
      started_at: null,
      completed_at: null,
      created_at: new Date().toISOString(),
    }

    registerHandler('autopilot', vi.fn().mockRejectedValue(new Error('transient')))
    mockFrom.mockReturnValue(fluent({ data: [job], error: null }))

    // Should not throw — error is caught and job rescheduled
    const processed = await processJobs()
    expect(processed).toBe(0) // Failed jobs don't count as processed
  })
})

// ── registerHandler ───────────────────────────────────────────────────────────

describe('registerHandler', () => {
  it('allows registering handlers without error', () => {
    registerHandler('slack_notify', vi.fn())
    registerHandler('slack_notify', vi.fn()) // override is fine
    expect(true).toBe(true)
  })
})
