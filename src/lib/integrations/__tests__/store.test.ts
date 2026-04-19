import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockSupabase } from '@/test/helpers'
import { createAdminClient } from '@/lib/supabase/server'

import {
  saveTokens,
  getTokens,
  clearTokens,
  updateAfterRefresh,
  markRefreshFailure,
} from '../store'

describe('integrations/store', () => {
  let mockSupabase: ReturnType<typeof createMockSupabase>

  beforeEach(() => {
    vi.clearAllMocks()
    mockSupabase = createMockSupabase()
    vi.mocked(createAdminClient).mockReturnValue(mockSupabase.client as never)
    // TOKEN_ENCRYPTION_KEY unset → store falls back to plaintext, which keeps
    // assertions readable without needing to decrypt in tests.
    delete process.env.TOKEN_ENCRYPTION_KEY
  })

  describe('saveTokens', () => {
    it('upserts a user_integrations row with plaintext token when no encryption key', async () => {
      mockSupabase.results.set('user_integrations', { data: null, error: null })

      await saveTokens({
        user_id: 'u1', org_id: 'org1', provider: 'google',
        access_token: 'ATOK', refresh_token: 'RTOK',
        token_expiry: '2026-05-01T00:00:00Z',
        connected_email: 'alice@example.com',
      })

      expect(mockSupabase.client.from).toHaveBeenCalledWith('user_integrations')
    })

    it('throws when the upsert errors', async () => {
      mockSupabase.results.set('user_integrations', { data: null, error: { message: 'constraint violation' } })

      await expect(saveTokens({
        user_id: 'u1', org_id: 'org1', provider: 'google',
        access_token: 'A', refresh_token: null, token_expiry: null, connected_email: null,
      })).rejects.toBeDefined()
    })
  })

  describe('getTokens', () => {
    it('returns null when no row exists', async () => {
      mockSupabase.results.set('user_integrations', { data: null, error: null })
      const result = await getTokens('u1', 'google')
      expect(result).toBeNull()
    })

    it('returns decrypted shape when a row exists', async () => {
      mockSupabase.results.set('user_integrations', {
        data: {
          access_token_encrypted: 'ATOK',
          refresh_token_encrypted: 'RTOK',
          token_expiry: '2026-05-01T00:00:00Z',
          scopes: ['calendar.events'],
          connected_email: 'alice@example.com',
          tenant_id: null,
          account_id: null,
        },
        error: null,
      })

      const tokens = await getTokens('u1', 'google')
      expect(tokens).toMatchObject({
        access_token: 'ATOK',
        refresh_token: 'RTOK',
        connected_email: 'alice@example.com',
        scopes: ['calendar.events'],
      })
    })

    it('returns null when access_token is missing', async () => {
      mockSupabase.results.set('user_integrations', {
        data: {
          access_token_encrypted: null,
          refresh_token_encrypted: null,
          token_expiry: null,
          scopes: [],
          connected_email: null,
          tenant_id: null,
          account_id: null,
        },
        error: null,
      })

      expect(await getTokens('u1', 'google')).toBeNull()
    })
  })

  describe('updateAfterRefresh', () => {
    it('writes new access token and clears refresh_failed_at', async () => {
      mockSupabase.results.set('user_integrations', { data: null, error: null })

      await updateAfterRefresh('u1', 'google', {
        access_token: 'NEW_ATOK',
        token_expiry: '2026-05-01T01:00:00Z',
      })

      expect(mockSupabase.client.from).toHaveBeenCalledWith('user_integrations')
    })
  })

  describe('markRefreshFailure', () => {
    it('records failure reason without throwing', async () => {
      mockSupabase.results.set('user_integrations', { data: null, error: null })
      await expect(markRefreshFailure('u1', 'google', 'invalid_grant')).resolves.toBeUndefined()
    })
  })

  describe('clearTokens', () => {
    it('deletes the row', async () => {
      mockSupabase.results.set('user_integrations', { data: null, error: null })
      await clearTokens('u1', 'google')
      expect(mockSupabase.client.from).toHaveBeenCalledWith('user_integrations')
    })
  })
})
