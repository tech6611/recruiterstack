import { describe, it, expect, vi, beforeEach } from 'vitest'

// Set env before importing module
vi.stubEnv('OAUTH_STATE_SECRET', 'test-secret-key-for-hmac-signing')

import { generateOAuthState, verifyOAuthState } from '../oauth-state'

describe('OAuth CSRF State', () => {
  beforeEach(() => {
    vi.unstubAllEnvs()
    vi.stubEnv('OAUTH_STATE_SECRET', 'test-secret-key-for-hmac-signing')
  })

  it('generates a state token with payload and signature', () => {
    const state = generateOAuthState('org_123')
    expect(state).toContain('.')
    const [encoded, signature] = state.split('.')
    expect(encoded).toBeTruthy()
    expect(signature).toBeTruthy()
  })

  it('round-trips: generate → verify returns orgId', () => {
    const orgId = 'org_abc123'
    const state = generateOAuthState(orgId)
    const result = verifyOAuthState(state)
    expect(result).toEqual({ orgId })
  })

  it('rejects a tampered signature', () => {
    const state = generateOAuthState('org_123')
    const [encoded] = state.split('.')
    const tampered = `${encoded}.tampered-signature`
    expect(verifyOAuthState(tampered)).toBeNull()
  })

  it('rejects a tampered payload', () => {
    const state = generateOAuthState('org_123')
    const [, signature] = state.split('.')
    const fakePayload = Buffer.from(JSON.stringify({
      orgId: 'org_evil',
      nonce: 'fake',
      exp: Date.now() + 600000,
    })).toString('base64url')
    expect(verifyOAuthState(`${fakePayload}.${signature}`)).toBeNull()
  })

  it('rejects an expired token', () => {
    // Generate a token, then mock Date.now to simulate time passing
    const state = generateOAuthState('org_123')

    // Fast-forward 11 minutes
    const originalDateNow = Date.now
    Date.now = () => originalDateNow() + 11 * 60 * 1000

    expect(verifyOAuthState(state)).toBeNull()

    Date.now = originalDateNow
  })

  it('rejects malformed state strings', () => {
    expect(verifyOAuthState('')).toBeNull()
    expect(verifyOAuthState('no-dot')).toBeNull()
    expect(verifyOAuthState('a.b.c')).toBeNull()
  })

  it('generates unique nonces for the same orgId', () => {
    const state1 = generateOAuthState('org_123')
    const state2 = generateOAuthState('org_123')
    expect(state1).not.toBe(state2)
  })
})
