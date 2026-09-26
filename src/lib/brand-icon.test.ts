import { describe, it, expect } from 'vitest'
import { brandDomain, brandIconSrc, brandInitials, isUnbrandable, normalizeName } from './brand-icon'

// Every messy string below is a real value from pool_experiences, candidate_experiences
// or an education record — not an invented edge case.

describe('normalizeName', () => {
  it('cuts a LinkedIn-style tagline at the separator', () => {
    expect(normalizeName('Calry | Unified API for Vacation Rental PMS Integrations')).toBe('calry')
    expect(normalizeName('Red Hat - Community Platform Engineering')).toBe('red hat')
  })
  it('drops parentheticals and case', () => {
    expect(normalizeName('LETSGROWMORE (LGM)')).toBe('letsgrowmore')
    expect(normalizeName('JLL (Jones Lang LaSalle)')).toBe('jll')
  })
  it('strips legal suffixes for a company', () => {
    expect(normalizeName('KeepWorks Technologies Pvt. Ltd.')).toBe('keepworks')
    expect(normalizeName('Tata Consultancy Services')).toBe('tata consultancy')
  })
  it('keeps the wording and the campus comma for a school', () => {
    // Company rules would cut at the comma and delete "Technology", leaving a name
    // that can never resolve to a campus.
    expect(normalizeName('Indian Institute of Technology, Madras', 'school'))
      .toBe('indian institute of technology madras')
    expect(normalizeName('SRM INSTITUTE OF SCIENCE AND TECHNOLOGY', 'school'))
      .toBe('srm institute of science and technology')
  })
})

describe('isUnbrandable', () => {
  it('rejects non-organisations', () => {
    expect(isUnbrandable('Freelance')).toBe(true)
    expect(isUnbrandable('Self-employed')).toBe(true)
    expect(isUnbrandable('Career Break')).toBe(true)
    expect(isUnbrandable('')).toBe(true)
  })
  it('rejects campus societies', () => {
    expect(isUnbrandable('E-Cell IIT Madras')).toBe(true)
    expect(isUnbrandable('Microsoft Learn Student Ambassadors DDU')).toBe(true)
  })
  it('accepts a real employer', () => {
    expect(isUnbrandable('Razorpay')).toBe(false)
  })
})

describe('brandDomain — companies', () => {
  it('guesses a slug for a plain brand', () => {
    expect(brandDomain('Stripe')).toBe('stripe.com')
    expect(brandDomain('HackerEarth')).toBe('hackerearth.com')
  })
  it('uses the alias table for the dirty head', () => {
    expect(brandDomain('GOLDMAN SACHS')).toBe('goldmansachs.com')
    expect(brandDomain('Boston Consulting Group (BCG)')).toBe('bcg.com')
    expect(brandDomain('Tata Consultancy Services')).toBe('tcs.com')
    expect(brandDomain('HEWLETT PACKARD ENTERPRISE')).toBe('hpe.com')
    expect(brandDomain('Facebook')).toBe('meta.com')
  })
  it('resolves through a tagline to the brand', () => {
    expect(brandDomain('Red Hat - Fedora Engineering')).toBe('redhat.com')
  })
  it('refuses to guess past three words, rather than inventing a domain', () => {
    // The old resolver answered googlesummerofcodefedora.com here.
    expect(brandDomain('Google Summer of Code - Fedora')).toBeNull()
    expect(brandDomain('Notable Contributions To Projects Used In Personal FOSS Endeavours')).toBeNull()
  })
  it('sends an institution in the employer field to the school tables', () => {
    expect(brandDomain('Indian Institute of Technology, Guwahati')).toBe('iitg.ac.in')
    expect(brandDomain('IIT Bombay')).toBe('iitb.ac.in')
  })
  it('is null for a non-organisation', () => {
    expect(brandDomain('Freelance')).toBeNull()
  })
})

describe('brandDomain — schools', () => {
  it('resolves IIT, IIM and NIT campuses however they are written', () => {
    expect(brandDomain('Indian Institute of Technology, Madras', 'school')).toBe('iitm.ac.in')
    expect(brandDomain('IIT Kharagpur', 'school')).toBe('iitkgp.ac.in')
    expect(brandDomain('Indian Institute of Management Ahmedabad', 'school')).toBe('iima.ac.in')
    expect(brandDomain('National Institute of Technology, Calicut', 'school')).toBe('nitc.ac.in')
  })
  it('keeps the campus that a comma-split would have destroyed', () => {
    expect(brandDomain('University of California, Berkeley', 'school')).toBe('berkeley.edu')
  })
  it('matches a longer name containing a known school', () => {
    expect(brandDomain('Stanford University Graduate School of Business', 'school')).toBe('stanford.edu')
  })
  it('never guesses a .com for an unknown school', () => {
    // A K-12 school has no logo to find; a guessed domain would be a wrong answer
    // dressed as a right one.
    expect(brandDomain('Kendriya Vidyalaya Mughalsarai, CBSE Board', 'school')).toBeNull()
    expect(brandDomain('Delhi Public School, Dhanbad', 'school')).toBeNull()
  })
})

describe('brandInitials', () => {
  it('single word → one letter', () => expect(brandInitials('Stripe')).toBe('S'))
  it('multi word → two letters', () => expect(brandInitials('Palo Alto Networks')).toBe('PA'))
  it('ignores leading punctuation', () => expect(brandInitials('.NET Foundation')).toBe('NF'))
  it('empty → ?', () => expect(brandInitials('')).toBe('?'))
})

describe('brandIconSrc', () => {
  it('points at our own proxy, never a third party', () => {
    expect(brandIconSrc('Figma')).toBe('/api/brand-icon?name=Figma&kind=company')
  })
  it('carries the kind so the server resolves the same way we did', () => {
    expect(brandIconSrc('IIT Madras', 'school'))
      .toBe('/api/brand-icon?name=IIT%20Madras&kind=school')
  })
  it('is null when only a monogram applies, so no request is made at all', () => {
    expect(brandIconSrc('Freelance')).toBeNull()
    expect(brandIconSrc('Kendriya Vidyalaya', 'school')).toBeNull()
  })
})
