import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { NextRequest } from 'next/server'

// "Find new people" must check talent-pool access BEFORE paying Crustdata:
// without access the scoring step returns nothing, so the credits are wasted.

const { sourceSpy, accessMock } = vi.hoisted(() => ({
  sourceSpy: vi.fn(),
  accessMock: vi.fn(),
}))

// Chainable Supabase stub: every query resolves to { data: null, error: null }.
const { sb } = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chain: any = new Proxy(() => {}, {
    get: (_t, prop) => (prop === 'then' ? (resolve: (v: unknown) => void) => resolve({ data: null, error: null }) : () => chain),
  })
  return { sb: { from: () => chain } }
})

// Bypass auth: call the handler directly with org_A.
vi.mock('@/lib/api/helpers', async (orig) => ({
  ...(await orig<typeof import('@/lib/api/helpers')>()),
  withCapability: (_cap: string, handler: (...a: unknown[]) => unknown) =>
    (req: unknown, ctx: unknown) => handler(req, 'org_A', sb, ctx, {}, 'user_1'),
}))
vi.mock('@/modules/ats/domain/job-role-context', () => ({ getJobRoleContext: vi.fn(async () => ({})) }))
vi.mock('@/modules/ats/domain/icp', () => ({
  getCurrentIcp: vi.fn(async () => ({ status: 'approved', version: 1, must_haves: [], competencies: [] })),
}))
vi.mock('@/modules/pool/domain/pool', () => ({ getPoolAccess: accessMock }))
vi.mock('@/modules/pool/domain/crustdata-acquire', async (orig) => ({
  ...(await orig<typeof import('@/modules/pool/domain/crustdata-acquire')>()),
  sourceFromIcp: sourceSpy,
}))

import { POST } from '../route'

const call = () =>
  (POST as unknown as (r: NextRequest, c: { params: { id: string } }) => Promise<Response>)(
    new Request('http://x/api/jobs/j1/source/crustdata', { method: 'POST', body: JSON.stringify({ score: false }) }) as unknown as NextRequest,
    { params: { id: 'j1' } },
  )

beforeEach(() => { sourceSpy.mockReset(); accessMock.mockReset() })

describe('POST /api/jobs/[id]/source/crustdata — pool access', () => {
  it('refuses with no_pool_access and never calls Crustdata when the workspace has no access', async () => {
    accessMock.mockResolvedValue({ hasAccess: false })
    const res = await call()
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.code).toBe('no_pool_access')
    expect(body.error).toMatch(/no credits were spent/)
    expect(sourceSpy).not.toHaveBeenCalled()
  })

  it('goes on to source when the workspace has access', async () => {
    accessMock.mockResolvedValue({ hasAccess: true, tier: 'trial', unlockQuota: 25, unlocksUsed: 0 })
    sourceSpy.mockRejectedValue(new Error('stop here')) // we only care that it was reached
    await call().catch(() => {})
    expect(sourceSpy).toHaveBeenCalledTimes(1)
  })
})
