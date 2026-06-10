import { describe, it, expect } from 'vitest'
import crypto from 'crypto'
import { verifyMetaSignature } from '../verify'

const SECRET = 'test-app-secret'

function sign(body: string, secret = SECRET): string {
  return `sha256=${crypto.createHmac('sha256', secret).update(body).digest('hex')}`
}

describe('verifyMetaSignature', () => {
  const rawBody = JSON.stringify({ entry: [{ changes: [] }] })

  it('accepts a valid signature', () => {
    expect(
      verifyMetaSignature({ rawBody, signature: sign(rawBody), appSecret: SECRET }),
    ).toBe(true)
  })

  it('rejects a signature from the wrong secret', () => {
    expect(
      verifyMetaSignature({ rawBody, signature: sign(rawBody, 'other-secret'), appSecret: SECRET }),
    ).toBe(false)
  })

  it('rejects a tampered body', () => {
    expect(
      verifyMetaSignature({ rawBody: rawBody + 'x', signature: sign(rawBody), appSecret: SECRET }),
    ).toBe(false)
  })

  it('rejects missing signature or secret', () => {
    expect(verifyMetaSignature({ rawBody, signature: null, appSecret: SECRET })).toBe(false)
    expect(verifyMetaSignature({ rawBody, signature: sign(rawBody), appSecret: null })).toBe(false)
    expect(verifyMetaSignature({ rawBody, signature: sign(rawBody), appSecret: undefined })).toBe(false)
  })

  it('rejects length-mismatched signatures without throwing', () => {
    expect(verifyMetaSignature({ rawBody, signature: 'sha256=short', appSecret: SECRET })).toBe(false)
  })
})
