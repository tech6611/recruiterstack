import { describe, it, expect } from 'vitest'
import { companyDomainGuess, companyLogoUrl, companyInitials } from './company-logo'

describe('companyDomainGuess', () => {
  it('guesses .com for a plain name', () => {
    expect(companyDomainGuess('Stripe')).toBe('stripe.com')
  })
  it('uses the known-domain override where a .com guess would be wrong', () => {
    expect(companyDomainGuess('Notion')).toBe('notion.so')
  })
  it('strips legal-form and generic suffixes', () => {
    expect(companyDomainGuess('Acme Inc')).toBe('acme.com')
    expect(companyDomainGuess('Foo Technologies')).toBe('foo.com')
  })
  it('drops punctuation and spaces', () => {
    expect(companyDomainGuess('Palo Alto Networks')).toBe('paloaltonetworks.com')
  })
  it('returns null when nothing usable remains', () => {
    expect(companyDomainGuess('   ')).toBeNull()
    expect(companyDomainGuess('')).toBeNull()
  })
})

describe('companyLogoUrl', () => {
  it('builds a Clearbit URL from the guessed domain', () => {
    expect(companyLogoUrl('Stripe')).toBe('https://logo.clearbit.com/stripe.com')
  })
  it('is null when no domain can be guessed', () => {
    expect(companyLogoUrl('   ')).toBeNull()
  })
})

describe('companyInitials', () => {
  it('single word → first letter', () => {
    expect(companyInitials('Stripe')).toBe('S')
  })
  it('multi word → first two word initials', () => {
    expect(companyInitials('Palo Alto Networks')).toBe('PA')
  })
  it('empty → ?', () => {
    expect(companyInitials('')).toBe('?')
  })
})
