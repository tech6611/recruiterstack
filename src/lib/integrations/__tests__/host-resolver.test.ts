import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockSupabase } from '@/test/helpers'
import { createAdminClient } from '@/lib/supabase/server'

// Mock per-provider helpers BEFORE importing the resolver.
vi.mock('@/lib/google/calendar', async () => {
  const actual = await vi.importActual<typeof import('@/lib/google/calendar')>('@/lib/google/calendar')
  return {
    ...actual,
    ensureValidGoogleTokensForUser: vi.fn(),
    getValidAccessToken: vi.fn(),
  }
})
vi.mock('@/lib/microsoft/calendar', async () => {
  const actual = await vi.importActual<typeof import('@/lib/microsoft/calendar')>('@/lib/microsoft/calendar')
  return {
    ...actual,
    ensureValidMSTokensForUser: vi.fn(),
    getValidAccessToken: vi.fn(),
  }
})
vi.mock('@/lib/zoom/meetings', async () => {
  const actual = await vi.importActual<typeof import('@/lib/zoom/meetings')>('@/lib/zoom/meetings')
  return {
    ...actual,
    ensureValidZoomTokensForUser: vi.fn(),
    getValidAccessToken: vi.fn(),
  }
})

import { resolveHost, HostTokenUnavailableError } from '../host-resolver'
import {
  ensureValidGoogleTokensForUser,
  GoogleNotConnectedError,
} from '@/lib/google/calendar'

describe('resolveHost (Google)', () => {
  let mockSupabase: ReturnType<typeof createMockSupabase>

  beforeEach(() => {
    vi.clearAllMocks()
    mockSupabase = createMockSupabase()
    vi.mocked(createAdminClient).mockReturnValue(mockSupabase.client as never)
  })

  it('returns the first panelist whose per-user tokens work', async () => {
    // users query returns two matches in panel order
    mockSupabase.results.set('users', {
      data: [
        { id: 'user-A', email: 'alice@example.com' },
        { id: 'user-B', email: 'bob@example.com' },
      ],
      error: null,
    })

    vi.mocked(ensureValidGoogleTokensForUser).mockResolvedValueOnce({
      access_token: 'ALICE_TOKEN',
      connected_email: 'alice@example.com',
    })

    const host = await resolveHost('google', ['alice@example.com', 'bob@example.com'], 'org1')

    expect(host.access_token).toBe('ALICE_TOKEN')
    expect(host.host_user_id).toBe('user-A')
    expect(host.via).toBe('user_integrations')
    expect(ensureValidGoogleTokensForUser).toHaveBeenCalledTimes(1)
  })

  it('skips a panelist with GoogleNotConnectedError and tries the next', async () => {
    mockSupabase.results.set('users', {
      data: [
        { id: 'user-A', email: 'alice@example.com' },
        { id: 'user-B', email: 'bob@example.com' },
      ],
      error: null,
    })

    vi.mocked(ensureValidGoogleTokensForUser)
      .mockRejectedValueOnce(new GoogleNotConnectedError('user-A'))
      .mockResolvedValueOnce({ access_token: 'BOB_TOKEN', connected_email: 'bob@example.com' })

    const host = await resolveHost('google', ['alice@example.com', 'bob@example.com'], 'org1')

    expect(host.access_token).toBe('BOB_TOKEN')
    expect(host.host_user_id).toBe('user-B')
    expect(host.via).toBe('user_integrations')
    expect(ensureValidGoogleTokensForUser).toHaveBeenCalledTimes(2)
  })

  it('skips a panelist whose refresh throws generically and tries the next', async () => {
    mockSupabase.results.set('users', {
      data: [
        { id: 'user-A', email: 'alice@example.com' },
        { id: 'user-B', email: 'bob@example.com' },
      ],
      error: null,
    })

    vi.mocked(ensureValidGoogleTokensForUser)
      .mockRejectedValueOnce(new Error('invalid_grant'))                           // A's refresh token revoked
      .mockResolvedValueOnce({ access_token: 'BOB_TOKEN', connected_email: null })

    const host = await resolveHost('google', ['alice@example.com', 'bob@example.com'], 'org1')
    expect(host.host_user_id).toBe('user-B')
  })

  it('throws HostTokenUnavailableError when nothing works', async () => {
    mockSupabase.results.set('users', { data: [], error: null })
    mockSupabase.results.set('org_settings', { data: null, error: null })

    await expect(resolveHost('google', ['external@vendor.com'], 'org1'))
      .rejects
      .toBeInstanceOf(HostTokenUnavailableError)
  })
})
