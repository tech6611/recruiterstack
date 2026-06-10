import { describe, it, expect } from 'vitest'
import crypto from 'crypto'
import { verifyMetaSignature, verifyVobizSignature } from '../verify'

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

describe('verifyVobizSignature', () => {
  const BASE_URL = 'https://recruiterstack.in/api/webhooks/whatsapp'
  const AUTH_TOKEN = 'vobiz-auth-token'
  const NONCE = '12345678901234567890'

  const signV2 = (url: string, nonce: string, token = AUTH_TOKEN) =>
    crypto.createHmac('sha256', token).update(url + nonce).digest('base64')
  const signV3 = (url: string, nonce: string, token = AUTH_TOKEN) =>
    crypto.createHmac('sha256', token).update(`${url}.${nonce}`).digest('base64')

  it('accepts a valid V2 signature', () => {
    expect(
      verifyVobizSignature({
        baseUrl: BASE_URL,
        authToken: AUTH_TOKEN,
        v2Signature: signV2(BASE_URL, NONCE),
        v2Nonce: NONCE,
      }),
    ).toBe(true)
  })

  it('accepts a valid V3 signature', () => {
    expect(
      verifyVobizSignature({
        baseUrl: BASE_URL,
        authToken: AUTH_TOKEN,
        v3Signature: signV3(BASE_URL, NONCE),
        v3Nonce: NONCE,
      }),
    ).toBe(true)
  })

  it('rejects a signature made with the wrong token', () => {
    expect(
      verifyVobizSignature({
        baseUrl: BASE_URL,
        authToken: AUTH_TOKEN,
        v2Signature: signV2(BASE_URL, NONCE, 'other-token'),
        v2Nonce: NONCE,
      }),
    ).toBe(false)
  })

  it('rejects a tampered nonce or URL', () => {
    expect(
      verifyVobizSignature({
        baseUrl: BASE_URL,
        authToken: AUTH_TOKEN,
        v2Signature: signV2(BASE_URL, NONCE),
        v2Nonce: '99999999999999999999',
      }),
    ).toBe(false)
    expect(
      verifyVobizSignature({
        baseUrl: 'https://evil.example/api/webhooks/whatsapp',
        authToken: AUTH_TOKEN,
        v2Signature: signV2(BASE_URL, NONCE),
        v2Nonce: NONCE,
      }),
    ).toBe(false)
  })

  it('rejects when headers or token are missing', () => {
    expect(verifyVobizSignature({ baseUrl: BASE_URL, authToken: AUTH_TOKEN })).toBe(false)
    expect(
      verifyVobizSignature({
        baseUrl: BASE_URL,
        authToken: null,
        v2Signature: signV2(BASE_URL, NONCE),
        v2Nonce: NONCE,
      }),
    ).toBe(false)
  })

  it('falls back from an invalid V3 to a valid V2', () => {
    expect(
      verifyVobizSignature({
        baseUrl: BASE_URL,
        authToken: AUTH_TOKEN,
        v3Signature: 'not-a-signature',
        v3Nonce: NONCE,
        v2Signature: signV2(BASE_URL, NONCE),
        v2Nonce: NONCE,
      }),
    ).toBe(true)
  })
})
