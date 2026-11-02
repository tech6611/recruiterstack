import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextResponse } from 'next/server'

vi.mock('@/lib/auth', () => ({ requireOrgAndUser: vi.fn() }))
vi.mock('@/lib/api/rate-limit', () => ({ checkAuthRateLimit: vi.fn(() => Promise.resolve(null)) }))
vi.mock('@/lib/ai/jd-generator', () => ({ generateJD: vi.fn(() => Promise.resolve('# JD')) }))

import { POST } from '../route'
import { requireOrgAndUser } from '@/lib/auth'
import { generateJD } from '@/lib/ai/jd-generator'

const req = (body: unknown) => new Request('http://localhost:3000/api/intake/preview-jd', {
  method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' },
})

describe('/api/intake/preview-jd', () => {
  beforeEach(() => vi.clearAllMocks())

  it('refuses signed-out requests without calling the AI', async () => {
    vi.mocked(requireOrgAndUser).mockResolvedValue(NextResponse.json({ error: 'Not authenticated' }, { status: 401 }))
    const res = await POST(req({ position_title: 'Engineer' }) as never)
    expect(res.status).toBe(401)
    expect(generateJD).not.toHaveBeenCalled()
  })

  it('generates for a signed-in user', async () => {
    vi.mocked(requireOrgAndUser).mockResolvedValue({ orgId: 'org_1', userId: 'u1', clerkUserId: 'c1' })
    const res = await POST(req({ position_title: 'Engineer' }) as never)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ jd: '# JD' })
  })
})
