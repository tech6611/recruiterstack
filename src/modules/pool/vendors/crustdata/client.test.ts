import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { searchPeople, crustdataConfigured, CrustdataConfigError, CRUSTDATA_MAX_PAGE } from './client'

/** Build a fake fetch Response with headers + JSON body. */
function mockResponse(body: unknown, opts: { status?: number; headers?: Record<string, string> } = {}) {
  const status = opts.status ?? 200
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(opts.headers ?? {}),
    json: async () => body,
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
  } as unknown as Response
}

const OLD_ENV = process.env.CRUSTDATA_API_KEY

beforeEach(() => {
  process.env.CRUSTDATA_API_KEY = 'test-key-123'
})
afterEach(() => {
  process.env.CRUSTDATA_API_KEY = OLD_ENV
  vi.restoreAllMocks()
})

describe('crustdataConfigured', () => {
  it('reflects whether the key is set', () => {
    expect(crustdataConfigured()).toBe(true)
    delete process.env.CRUSTDATA_API_KEY
    expect(crustdataConfigured()).toBe(false)
  })
})

describe('searchPeople — request shape', () => {
  it('sends the auth + version headers, method and body Crustdata expects', async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockResponse({ profiles: [], total_count: 0 }))
    vi.stubGlobal('fetch', fetchMock)

    await searchPeople({ op: 'and', conditions: [] }, { limit: 1 })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api.crustdata.com/person/search')
    expect(init.method).toBe('POST')
    expect(init.headers.authorization).toBe('Bearer test-key-123')
    expect(init.headers['x-api-version']).toBe('2025-11-01')
    expect(JSON.parse(init.body)).toEqual({ filters: { op: 'and', conditions: [] }, limit: 1 })
  })

  it('defaults to limit 1 (credit safety) and only includes cursor/sorts when given', async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockResponse({ profiles: [] }))
    vi.stubGlobal('fetch', fetchMock)

    await searchPeople({ any: 'filter' })
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ filters: { any: 'filter' }, limit: 1 })

    await searchPeople({ any: 'filter' }, { limit: 5, cursor: 'abc', sorts: [{ field: 'x', order: 'desc' }] })
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({
      filters: { any: 'filter' },
      limit: 5,
      cursor: 'abc',
      sorts: [{ field: 'x', order: 'desc' }],
    })
  })

  it('clamps limit to [1, CRUSTDATA_MAX_PAGE]', async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockResponse({ profiles: [] }))
    vi.stubGlobal('fetch', fetchMock)

    await searchPeople({}, { limit: 99999 })
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).limit).toBe(CRUSTDATA_MAX_PAGE)

    await searchPeople({}, { limit: 0 })
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).limit).toBe(1)
  })
})

describe('searchPeople — response parsing', () => {
  it('extracts profiles, cursor, total and the credit + rate-limit headers', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      mockResponse(
        { profiles: [{ crustdata_person_id: 1 }, { crustdata_person_id: 2 }], next_cursor: 'next', total_count: 623 },
        { headers: { 'x-credits-used': '0.3', 'x-ratelimit-remaining': '29' } },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    const r = await searchPeople({}, { limit: 2 })
    expect(r.profiles).toHaveLength(2)
    expect(r.nextCursor).toBe('next')
    expect(r.totalCount).toBe(623)
    expect(r.creditsUsed).toBe(0.3)
    expect(r.rateLimitRemaining).toBe(29)
  })

  it('is defensive when optional fields / headers are absent', async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockResponse({}))
    vi.stubGlobal('fetch', fetchMock)

    const r = await searchPeople({})
    expect(r.profiles).toEqual([])
    expect(r.nextCursor).toBeNull()
    expect(r.totalCount).toBeNull()
    expect(r.creditsUsed).toBe(0)
    expect(r.rateLimitRemaining).toBeNull()
  })
})

describe('searchPeople — failure modes', () => {
  it('throws CrustdataConfigError when the key is missing (no fetch attempted)', async () => {
    delete process.env.CRUSTDATA_API_KEY
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await expect(searchPeople({})).rejects.toBeInstanceOf(CrustdataConfigError)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('throws CrustdataApiError with the status on a non-2xx response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockResponse('rate limited', { status: 429 }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(searchPeople({})).rejects.toMatchObject({ name: 'CrustdataApiError', status: 429 })
  })
})
