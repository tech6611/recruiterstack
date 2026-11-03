import { describe, it, expect } from 'vitest'
import { sanitizeDraftHtml } from './copilot-drafter'

describe('sanitizeDraftHtml', () => {
  it('keeps simple formatting and strips scripts, attributes and unknown tags', () => {
    const out = sanitizeDraftHtml('<h2 class="x">Role</h2><p onclick="evil()">Hi <strong>there</strong></p><script>alert(1)</script><a href="x">link</a><ul><li>One</li></ul>')
    expect(out).toBe('<h2>Role</h2><p>Hi <strong>there</strong></p>link<ul><li>One</li></ul>')
  })
})

import { buildDraftPrompt } from './copilot-drafter'

describe('buildDraftPrompt', () => {
  it('uses the company profile and past JDs for job descriptions, and drops emails', () => {
    const p = buildDraftPrompt({
      fieldKey: 'job_description', fieldLabel: 'Job description', subject: 'Backend Engineer',
      context: { 'Hiring manager': 'Sagar Kumar <sagar@example.com>', 'What will this person work on?': 'Own the scoring APIs' },
      company: { name: 'Acme', about: 'We build rockets.' },
      pastJds: ['Example JD text'],
    })
    expect(p).toContain('About: We build rockets.')
    expect(p).toContain('Example JD text')
    expect(p).toContain('Hiring manager: Sagar Kumar')
    expect(p).not.toContain('sagar@example.com')
    expect(p).toContain('What success looks like')
  })

  it('does not send past JDs for other fields', () => {
    const p = buildDraftPrompt({ fieldKey: 'justification', fieldLabel: 'Justification', context: {}, pastJds: ['Example JD text'] })
    expect(p).not.toContain('Example JD text')
  })
})
