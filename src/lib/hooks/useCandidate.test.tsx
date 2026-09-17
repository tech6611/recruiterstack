import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useCandidate } from './useCandidate'

const ok = (data: unknown) => ({ ok: true, status: 200, json: async () => ({ data }) })
const fail = (status: number) => ({ ok: false, status, json: async () => { throw new Error('html') } })

describe('useCandidate', () => {
  beforeEach(() => { vi.useFakeTimers({ shouldAdvanceTime: true }) })
  afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers() })

  it('a real 404 is "not_found" and is not retried', async () => {
    const f = vi.fn().mockResolvedValue(fail(404))
    vi.stubGlobal('fetch', f)
    const { result } = renderHook(() => useCandidate('c1'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error).toBe('not_found')
    expect(result.current.candidate).toBeNull()
    expect(f).toHaveBeenCalledTimes(1)
  })

  it('a transient 401 is retried once and succeeds silently', async () => {
    const f = vi.fn().mockResolvedValueOnce(fail(401)).mockResolvedValueOnce(ok({ id: 'c1', applications: [], events: [] }))
    vi.stubGlobal('fetch', f)
    const { result } = renderHook(() => useCandidate('c1'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error).toBeNull()
    expect(result.current.candidate?.id).toBe('c1')
    expect(f).toHaveBeenCalledTimes(2)
  })

  it('two failures in a row surface as "failed", not "not_found"', async () => {
    const f = vi.fn().mockResolvedValue(fail(500))
    vi.stubGlobal('fetch', f)
    const { result } = renderHook(() => useCandidate('c1'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error).toBe('failed')
    expect(f).toHaveBeenCalledTimes(2)
  })

  it('a network throw is treated as transient, then failed', async () => {
    const f = vi.fn().mockRejectedValue(new Error('offline'))
    vi.stubGlobal('fetch', f)
    const { result } = renderHook(() => useCandidate('c1'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error).toBe('failed')
    expect(f).toHaveBeenCalledTimes(2)
  })
})
