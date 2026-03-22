import { describe, it, expect, vi, beforeEach } from 'vitest'
import crypto from 'crypto'

// Generate a valid 32-byte hex key for testing
const TEST_KEY = crypto.randomBytes(32).toString('hex')

vi.stubEnv('TOKEN_ENCRYPTION_KEY', TEST_KEY)

import { encrypt, decrypt, decryptSafe } from '../crypto'

describe('Token Encryption (AES-256-GCM)', () => {
  beforeEach(() => {
    vi.unstubAllEnvs()
    vi.stubEnv('TOKEN_ENCRYPTION_KEY', TEST_KEY)
  })

  it('round-trips: encrypt → decrypt returns original', () => {
    const plaintext = 'ya29.a0AfH6SMBmGz...'
    const encrypted = encrypt(plaintext)
    expect(decrypt(encrypted)).toBe(plaintext)
  })

  it('encrypted output has iv:ciphertext:authTag format', () => {
    const encrypted = encrypt('test-token')
    const parts = encrypted.split(':')
    expect(parts).toHaveLength(3)
    // Each part should be valid base64
    parts.forEach(part => {
      expect(() => Buffer.from(part, 'base64')).not.toThrow()
    })
  })

  it('produces different ciphertexts for the same plaintext (unique IVs)', () => {
    const encrypted1 = encrypt('same-token')
    const encrypted2 = encrypt('same-token')
    expect(encrypted1).not.toBe(encrypted2)
    // But both decrypt to the same value
    expect(decrypt(encrypted1)).toBe('same-token')
    expect(decrypt(encrypted2)).toBe('same-token')
  })

  it('detects tampered ciphertext', () => {
    const encrypted = encrypt('secret-token')
    const parts = encrypted.split(':')
    // Tamper with the ciphertext portion
    parts[1] = Buffer.from('tampered').toString('base64')
    const tampered = parts.join(':')
    expect(() => decrypt(tampered)).toThrow()
  })

  it('detects tampered auth tag', () => {
    const encrypted = encrypt('secret-token')
    const parts = encrypted.split(':')
    parts[2] = Buffer.from('0000000000000000').toString('base64')
    const tampered = parts.join(':')
    expect(() => decrypt(tampered)).toThrow()
  })

  it('rejects invalid format', () => {
    expect(() => decrypt('not-encrypted')).toThrow('Invalid encrypted format')
    expect(() => decrypt('a:b')).toThrow('Invalid encrypted format')
  })

  it('throws if key is invalid length', () => {
    vi.stubEnv('TOKEN_ENCRYPTION_KEY', 'too-short')
    // Re-import to pick up new env
    expect(() => encrypt('test')).toThrow('TOKEN_ENCRYPTION_KEY must be a 64-char hex string')
  })
})

describe('decryptSafe', () => {
  beforeEach(() => {
    vi.unstubAllEnvs()
    vi.stubEnv('TOKEN_ENCRYPTION_KEY', TEST_KEY)
  })

  it('returns null for null input', () => {
    expect(decryptSafe(null)).toBeNull()
  })

  it('decrypts valid encrypted strings', () => {
    const encrypted = encrypt('my-token')
    expect(decryptSafe(encrypted)).toBe('my-token')
  })

  it('returns plaintext if decryption fails (migration support)', () => {
    const plaintext = 'ya29.plaintext-token'
    expect(decryptSafe(plaintext)).toBe(plaintext)
  })

  it('returns value as-is when TOKEN_ENCRYPTION_KEY is not set', () => {
    vi.stubEnv('TOKEN_ENCRYPTION_KEY', '')
    expect(decryptSafe('some-token')).toBe('some-token')
  })
})
