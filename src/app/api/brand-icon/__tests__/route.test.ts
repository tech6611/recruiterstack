import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'
import { GET } from '../route'

/**
 * The bit worth testing is the one nobody can eyeball: the favicon service answers 200
 * with a generic globe when it has nothing, so "did an image come back" is not the same
 * question as "did a logo come back". GENERIC_GLOBE below is the real 726-byte PNG the
 * service returns for a domain that does not exist — captured from a live call, so this
 * test fails if the digest the route screens for ever drifts.
 *
 * Every case uses a different employer because the route memoises per domain inside a
 * warm process, exactly as it will in production.
 */

const GENERIC_GLOBE = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAACXBIWXMAAAsSAAALEgHS3X78AAACiElEQVQ4EaVTzU8TURCf' +
    '2tJuS7tQtlRb6UKBIkQwkRRSEzkQgyEc6lkOKgcOph78Y+CgjXjDs2i44FXY9AMTlQRUELZapVlouy3d7kKtb0Zr0MSLTvL2' +
    'zb75eL838xtTvV6H/xELBptMJojeXLCXyobnyog4YhzXYvmCFi6qVSfaeRdXdrfaU1areV5KykmX06rcvzumjY/1ggkR3Jh+' +
    'bNf1mr8v1D5bLuvR3qDgFbvbBJYIrE1mCIoCrKxsHuzK+Rzvsi29+6DEbTZz9unijEYI8ObBgXOzlcrx9OAlXyDYKUCzwwrD' +
    'Qx1wVDGg089Dt+gR3mxmhcUnaWeoxwMbm/vzDFzmDEKMMNhquRqduT1KwXiGt0vre6iSeAUHNDE0d26NBtAXY9BACQyjFusK' +
    'uL2Ry+IPb/Y9ZglwuVscdHaknUChqLF/O4jn3V5dP4mhgRJgwSYm+gV0Oi3XrvYB30yvhGa7BS70eGFHPoTJyQHhMK+F0Zes' +
    'RVVznvXw5Ixv7/C10moEo6OZXbWvlFAF9FVZDOqEABUMRIkMd8GnLwVWg9/RkJF9sA4oDfYQAuzzjqzwvnaRUFxn/X2ZlmGL' +
    'XAE7AL52B4xHgqAUqrC1nSNuoJkQtLkdqReszz/9aRvq90NOKdOS1nch8TpL555WDp49f3uAMXhACRjD5j4ykuCtf5PP7Fm1' +
    'b0DIsl/VHGezzP1KwOiZQobFF9YyjSRYQETRENSlVzI8iK9mWlzckpSSCQHVALmN9Az1euDho9Xo8vKGd2rqooA8yBcrwHgC' +
    'qYR0kMkWci08t/R+W4ljDCanWTg9TJGwGNaNk3vYZ7VUdeKsYJGFNkfSzjXNrSX20s4/h6kB81/271ghG17l+rPTAAAAAElF' +
    'TkSuQmCC',
  'base64',
)
const REAL_LOGO = Buffer.from('PNG-a-genuine-brand-mark')

const req = (name: string, kind = 'company') =>
  new NextRequest(`https://app.test/api/brand-icon?name=${encodeURIComponent(name)}&kind=${kind}`)

const imageResponse = (body: Buffer) =>
  ({
    ok: true,
    headers: new Headers({ 'content-type': 'image/png' }),
    arrayBuffer: async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength),
  }) as unknown as Response

describe('/api/brand-icon', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('fetch', fetchMock)
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('never calls a provider when the name resolves to a monogram', async () => {
    const res = await GET(req('Freelance'))
    expect(res.status).toBe(404)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('serves a real logo with a long cache', async () => {
    fetchMock.mockResolvedValueOnce(imageResponse(REAL_LOGO))
    const res = await GET(req('Figma'))
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('image/png')
    expect(res.headers.get('cache-control')).toContain('max-age=2592000')
  })

  it('treats the provider’s generic globe as a miss, not a logo', async () => {
    fetchMock.mockResolvedValueOnce(imageResponse(GENERIC_GLOBE))
    const res = await GET(req('Zeotap'))
    expect(res.status).toBe(404)
  })

  it('asks the resolved domain, and asks it from the server', async () => {
    fetchMock.mockResolvedValueOnce(imageResponse(REAL_LOGO))
    await GET(req('Razorpay'))
    expect(String(fetchMock.mock.calls[0][0])).toContain('razorpay.com')
  })

  it('rejects a non-image answer', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      headers: new Headers({ 'content-type': 'text/html' }),
    } as unknown as Response)
    const res = await GET(req('Zulip'))
    expect(res.status).toBe(404)
  })

  it('treats an upstream failure as a miss, and caches the miss', async () => {
    fetchMock.mockRejectedValueOnce(new Error('network down'))
    const res = await GET(req('Globant'))
    expect(res.status).toBe(404)
    expect(res.headers.get('cache-control')).toContain('max-age=86400')
  })

  it('rejects a request with no name', async () => {
    const res = await GET(new NextRequest('https://app.test/api/brand-icon'))
    expect(res.status).toBe(400)
  })

  it('routes a school through the school resolver', async () => {
    fetchMock.mockResolvedValueOnce(imageResponse(REAL_LOGO))
    await GET(req('Indian Institute of Technology, Madras', 'school'))
    expect(String(fetchMock.mock.calls[0][0])).toContain('iitm.ac.in')
  })
})
