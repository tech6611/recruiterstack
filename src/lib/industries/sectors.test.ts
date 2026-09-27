import { describe, it, expect } from 'vitest'
import { canonicalIndustry, companySector } from './sectors'

describe('canonicalIndustry', () => {
  it('folds the spellings of one idea together', () => {
    // These five all appeared in the real enrichment for the same idea.
    for (const s of ['Fintech', 'FinTech', 'Financial Software', 'Payments', 'payment system']) {
      expect(canonicalIndustry(s)).toBe('Fintech')
    }
  })

  it('reads a university as higher education, not as schooling', () => {
    expect(canonicalIndustry('Higher Education')).toBe('Higher Education')
    expect(canonicalIndustry('EdTech')).toBe('Education')
  })

  it('does not read "except insurance" as insurance', () => {
    // A real string from the data: "financial service activities, except insurance and
    // pension funding". The exclusion used to file banks under Insurance.
    expect(canonicalIndustry('financial service activities, except insurance and pension funding'))
      .toBe('Banking & Finance')
  })

  it('returns null rather than guessing', () => {
    expect(canonicalIndustry('conglomerate')).toBeNull()
    expect(canonicalIndustry('International Standard Industrial Classification')).toBeNull()
    expect(canonicalIndustry('')).toBeNull()
  })
})

describe('companySector', () => {
  it('takes the most telling string, not the first one', () => {
    // Razorpay and Stripe both list the vague word first.
    expect(companySector(['software industry', 'payment system'])).toBe('Fintech')
    expect(companySector(['financial services', 'mobile payment industry'])).toBe('Fintech')
  })

  it('lets the market beat the technology it is built on', () => {
    // Ironclad is legal software that uses AI; Lattice is HR software that uses AI.
    // Calling both "AI" describes neither.
    expect(companySector(['Business/Productivity Software', 'Legal Tech', 'Artificial Intelligence & Machine Learning']))
      .toBe('Legal Tech')
    expect(companySector(['Business/Productivity Software', 'HR Tech', 'Artificial Intelligence & Machine Learning']))
      .toBe('HR Tech')
  })

  it('still names AI when AI is the whole company', () => {
    expect(companySector(['Artificial Intelligence', 'Machine Learning', 'AI Infrastructure']))
      .toBe('AI & Machine Learning')
  })

  it('follows the source order when nothing specific matches', () => {
    // Google: every string is a generic. Only the source knows which came first.
    expect(companySector(['Internet industry', 'software industry', 'information technology', 'technology industry']))
      .toBe('Consumer Internet')
  })

  it('puts CPaaS in telecom, not in the cloud', () => {
    // Plivo and Twilio sell SMS, voice and numbers. The cloud is how it is delivered,
    // not what it is — and by this file's own rule the market beats the delivery layer.
    expect(companySector(['Technology', 'Information and Internet', 'Cloud Communications', 'CPaaS']))
      .toBe('Telecom')
    // But a communication SOFTWARE product is not a carrier.
    expect(companySector(['Communication Software', 'Software Development', 'Enterprise Software']))
      .toBe('Enterprise Software')
  })

  it('does not let one technology layer swallow its peers', () => {
    // Postman: API tooling that also does AI. With rule order deciding inside a tier,
    // its fifth listed industry beat its third and it came back as an AI company.
    expect(companySector(['Software Development', 'SaaS', 'API Development', 'CloudTech & DevOps', 'Artificial Intelligence & Machine Learning']))
      .toBe('Developer Tools & Cloud')
    // An AI company that lists AI first still reads as one.
    expect(companySector(['Artificial Intelligence & Machine Learning', 'SaaS', 'API Development']))
      .toBe('AI & Machine Learning')
  })

  it('is null when no string maps', () => {
    expect(companySector(['conglomerate'])).toBeNull()
    expect(companySector([])).toBeNull()
    expect(companySector(null)).toBeNull()
  })
})
