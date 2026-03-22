import crypto from 'crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12
const AUTH_TAG_LENGTH = 16

function getKey(): Buffer {
  const hex = process.env.TOKEN_ENCRYPTION_KEY
  if (!hex || hex.length !== 64) {
    throw new Error('TOKEN_ENCRYPTION_KEY must be a 64-char hex string (32 bytes)')
  }
  return Buffer.from(hex, 'hex')
}

/**
 * Encrypt a plaintext string using AES-256-GCM.
 * Returns "iv:ciphertext:authTag" (all base64).
 */
export function encrypt(plaintext: string): string {
  const key = getKey()
  const iv = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH })

  let encrypted = cipher.update(plaintext, 'utf8', 'base64')
  encrypted += cipher.final('base64')
  const authTag = cipher.getAuthTag().toString('base64')

  return `${iv.toString('base64')}:${encrypted}:${authTag}`
}

/**
 * Decrypt an encrypted string produced by encrypt().
 * Throws on tamper or invalid format.
 */
export function decrypt(encrypted: string): string {
  const parts = encrypted.split(':')
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted format')
  }

  const [ivB64, ciphertextB64, authTagB64] = parts
  const key = getKey()
  const iv = Buffer.from(ivB64, 'base64')
  const authTag = Buffer.from(authTagB64, 'base64')

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH })
  decipher.setAuthTag(authTag)

  let decrypted = decipher.update(ciphertextB64, 'base64', 'utf8')
  decrypted += decipher.final('utf8')
  return decrypted
}

/**
 * Try to decrypt a value. If it fails (e.g. plaintext token from before encryption),
 * return the original value. This allows gradual migration.
 */
export function decryptSafe(value: string | null): string | null {
  if (!value) return null
  // If no encryption key is configured, return as-is
  if (!process.env.TOKEN_ENCRYPTION_KEY) return value
  try {
    return decrypt(value)
  } catch {
    // Likely a plaintext token from before encryption was enabled
    return value
  }
}
