import { describe, it, expect } from 'vitest'
import { sanitizeDraftHtml } from './copilot-drafter'

describe('sanitizeDraftHtml', () => {
  it('keeps simple formatting and strips scripts, attributes and unknown tags', () => {
    const out = sanitizeDraftHtml('<h2 class="x">Role</h2><p onclick="evil()">Hi <strong>there</strong></p><script>alert(1)</script><a href="x">link</a><ul><li>One</li></ul>')
    expect(out).toBe('<h2>Role</h2><p>Hi <strong>there</strong></p>link<ul><li>One</li></ul>')
  })
})
