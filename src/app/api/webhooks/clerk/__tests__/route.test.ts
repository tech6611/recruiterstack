import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Mocks ──────────────────────────────────────────────────────────────────
// vi.mock factories run before top-level code (hoisting). Use vi.hoisted so
// mockVerify is initialized before the svix mock references it.
const { mockVerify } = vi.hoisted(() => ({ mockVerify: vi.fn() }))

vi.mock('svix', () => ({
  // Use a constructor function (arrows can't be called with `new`).
  Webhook: function () {
    return { verify: mockVerify }
  },
}))

// Mock the sync helpers — we're testing routing logic, not DB behavior.
vi.mock('@/lib/clerk/sync', () => ({
  syncUserFromClerk: vi.fn(),
  syncMembershipFromClerk: vi.fn(),
  deactivateUser: vi.fn(),
  deactivateMembership: vi.fn(),
}))

import { POST } from '../route'
import {
  syncUserFromClerk,
  syncMembershipFromClerk,
  deactivateUser,
  deactivateMembership,
} from '@/lib/clerk/sync'

// ── Helpers ────────────────────────────────────────────────────────────────

function makeRequest(body: unknown, headers: Record<string, string> = {}): Request {
  const defaultHeaders: Record<string, string> = {
    'svix-id': 'msg_test',
    'svix-timestamp': '1700000000',
    'svix-signature': 'v1,test',
    'content-type': 'application/json',
    ...headers,
  }
  return new Request('http://localhost:3000/api/webhooks/clerk', {
    method: 'POST',
    headers: defaultHeaders,
    body: JSON.stringify(body),
  })
}

const sampleUser = {
  id: 'user_abc',
  email_addresses: [{ id: 'eml_1', email_address: 'alice@example.com' }],
  primary_email_address_id: 'eml_1',
  first_name: 'Alice',
  last_name: 'A',
  image_url: null,
}

const sampleMembership = {
  organization: { id: 'org_abc' },
  public_user_data: { user_id: 'user_abc' },
  role: 'org:member',
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('POST /api/webhooks/clerk', () => {
  beforeEach(() => {
    mockVerify.mockReset()
    vi.mocked(syncUserFromClerk).mockReset()
    vi.mocked(syncMembershipFromClerk).mockReset()
    vi.mocked(deactivateUser).mockReset()
    vi.mocked(deactivateMembership).mockReset()
    process.env.CLERK_WEBHOOK_SIGNING_SECRET = 'whsec_test_secret'
  })

  it('returns 500 when signing secret is not configured', async () => {
    delete process.env.CLERK_WEBHOOK_SIGNING_SECRET
    const res = await POST(makeRequest({ type: 'user.created', data: sampleUser }))
    expect(res.status).toBe(500)
  })

  it('returns 400 when svix headers are missing', async () => {
    const req = new Request('http://localhost:3000/api/webhooks/clerk', {
      method: 'POST',
      body: JSON.stringify({ type: 'user.created', data: sampleUser }),
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('returns 401 when svix verification throws', async () => {
    mockVerify.mockImplementationOnce(() => {
      throw new Error('bad signature')
    })
    const res = await POST(makeRequest({ type: 'user.created', data: sampleUser }))
    expect(res.status).toBe(401)
    expect(syncUserFromClerk).not.toHaveBeenCalled()
  })

  it('user.created → syncUserFromClerk', async () => {
    mockVerify.mockReturnValueOnce({ type: 'user.created', data: sampleUser })
    const res = await POST(makeRequest({ type: 'user.created', data: sampleUser }))
    expect(res.status).toBe(200)
    expect(syncUserFromClerk).toHaveBeenCalledWith(sampleUser)
  })

  it('user.updated → syncUserFromClerk', async () => {
    mockVerify.mockReturnValueOnce({ type: 'user.updated', data: sampleUser })
    const res = await POST(makeRequest({ type: 'user.updated', data: sampleUser }))
    expect(res.status).toBe(200)
    expect(syncUserFromClerk).toHaveBeenCalledWith(sampleUser)
  })

  it('user.deleted → deactivateUser', async () => {
    mockVerify.mockReturnValueOnce({ type: 'user.deleted', data: { id: 'user_abc' } })
    const res = await POST(makeRequest({ type: 'user.deleted', data: { id: 'user_abc' } }))
    expect(res.status).toBe(200)
    expect(deactivateUser).toHaveBeenCalledWith('user_abc')
  })

  it('organizationMembership.created → syncMembershipFromClerk', async () => {
    mockVerify.mockReturnValueOnce({ type: 'organizationMembership.created', data: sampleMembership })
    const res = await POST(makeRequest({ type: 'organizationMembership.created', data: sampleMembership }))
    expect(res.status).toBe(200)
    expect(syncMembershipFromClerk).toHaveBeenCalledWith(sampleMembership)
  })

  it('organizationMembership.updated → syncMembershipFromClerk', async () => {
    mockVerify.mockReturnValueOnce({ type: 'organizationMembership.updated', data: sampleMembership })
    const res = await POST(makeRequest({ type: 'organizationMembership.updated', data: sampleMembership }))
    expect(res.status).toBe(200)
    expect(syncMembershipFromClerk).toHaveBeenCalledWith(sampleMembership)
  })

  it('organizationMembership.deleted → deactivateMembership', async () => {
    mockVerify.mockReturnValueOnce({ type: 'organizationMembership.deleted', data: sampleMembership })
    const res = await POST(makeRequest({ type: 'organizationMembership.deleted', data: sampleMembership }))
    expect(res.status).toBe(200)
    expect(deactivateMembership).toHaveBeenCalledWith('org_abc', 'user_abc')
  })

  it('unknown event type → 200 but no sync called', async () => {
    mockVerify.mockReturnValueOnce({ type: 'session.created', data: { id: 'sess_1' } })
    const res = await POST(makeRequest({ type: 'session.created', data: { id: 'sess_1' } }))
    expect(res.status).toBe(200)
    expect(syncUserFromClerk).not.toHaveBeenCalled()
    expect(syncMembershipFromClerk).not.toHaveBeenCalled()
  })

  it('returns 500 when sync throws (so Clerk retries)', async () => {
    mockVerify.mockReturnValueOnce({ type: 'user.created', data: sampleUser })
    vi.mocked(syncUserFromClerk).mockRejectedValueOnce(new Error('db unavailable'))
    const res = await POST(makeRequest({ type: 'user.created', data: sampleUser }))
    expect(res.status).toBe(500)
  })
})
