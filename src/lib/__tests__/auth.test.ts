import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { requireOrg, getOrgId } from '@/lib/auth'

vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn(),
}))

const mockAuth = vi.mocked(auth)

// Suppress fetch calls to Clerk API in tests
global.fetch = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
})

describe('requireOrg', () => {
  it('returns orgId when present in JWT', async () => {
    mockAuth.mockReturnValue({ userId: 'user_1', orgId: 'org_1' } as ReturnType<typeof auth>)
    const result = await requireOrg()
    expect(result).toEqual({ orgId: 'org_1' })
  })

  it('returns 401 NextResponse when no userId and no orgId', async () => {
    mockAuth.mockReturnValue({ userId: null, orgId: null } as unknown as ReturnType<typeof auth>)
    const result = await requireOrg()
    expect(result).toBeInstanceOf(NextResponse)
    if (result instanceof NextResponse) {
      expect(result.status).toBe(401)
    }
  })

  it('falls back to Clerk API lookup when orgId missing but userId present', async () => {
    mockAuth.mockReturnValue({ userId: 'user_1', orgId: null } as unknown as ReturnType<typeof auth>)

    const mockFetch = vi.mocked(global.fetch)
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [{ organization: { id: 'org_fallback' } }],
      }),
    } as Response)

    const result = await requireOrg()
    expect(result).toEqual({ orgId: 'org_fallback' })
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  it('returns 401 when Clerk API lookup fails', async () => {
    mockAuth.mockReturnValue({ userId: 'user_1', orgId: null } as unknown as ReturnType<typeof auth>)
    const mockFetch = vi.mocked(global.fetch)
    mockFetch.mockResolvedValue({ ok: false } as Response)

    const result = await requireOrg()
    expect(result).toBeInstanceOf(NextResponse)
  })
})

describe('getOrgId', () => {
  it('returns orgId when present', async () => {
    mockAuth.mockReturnValue({ userId: 'user_1', orgId: 'org_1' } as ReturnType<typeof auth>)
    const result = await getOrgId()
    expect(result).toBe('org_1')
  })

  it('returns null when no auth context', async () => {
    mockAuth.mockReturnValue({ userId: null, orgId: null } as unknown as ReturnType<typeof auth>)
    const result = await getOrgId()
    expect(result).toBeNull()
  })
})
