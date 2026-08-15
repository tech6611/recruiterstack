import { describe, it, expect } from 'vitest'
import { buildOutreachPrompt } from './outreach-draft'

describe('buildOutreachPrompt', () => {
  it('weaves in the fit rationale and evidence so the message is personal', () => {
    const p = buildOutreachPrompt({
      first_name: 'Priya',
      candidate_title: 'Business Operations Manager',
      role_title: 'Strategy & Operations Manager',
      company_name: 'Acme',
      recruiter_name: 'Sam',
      why_they_fit: 'Strong operational efficiency and process design background',
      evidence: ['Builds financial models from scratch', 'Independently queries SQL'],
    })
    expect(p).toContain('Priya')
    expect(p).toContain('Strategy & Operations Manager')
    expect(p).toContain('Strong operational efficiency')
    expect(p).toContain('Builds financial models from scratch')
    expect(p.toLowerCase()).toContain('cold-outreach') // framed as sourcing outreach, not a pipeline email
  })

  it('degrades gracefully when there is no fit evidence', () => {
    const p = buildOutreachPrompt({
      first_name: 'there',
      role_title: 'Engineer',
      company_name: 'our company',
      recruiter_name: 'Sam',
    })
    expect(p).toContain('No specific fit notes')
  })
})
