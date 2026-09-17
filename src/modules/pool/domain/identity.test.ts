import { describe, it, expect } from 'vitest'
import {
  normalizeEmail,
  normalizeLinkedIn,
  normalizeGithub,
  normalizePhone,
  normalizeIdentifiers,
} from './identity'

describe('normalizeEmail', () => {
  it('collapses the shapes two vendors use for one mailbox', () => {
    // The FIXTURE_COMPLETE / FIXTURE_DUPLICATE_STALE pair depends on this exact case.
    expect(normalizeEmail('Asha.Rao+jobs@Gmail.com')).toBe('asharao@gmail.com')
    expect(normalizeEmail('asharao@gmail.com')).toBe('asharao@gmail.com')
    expect(normalizeEmail('  mailto:ASHA.RAO@googlemail.com ')).toBe('asharao@googlemail.com')
  })
  it('strips +tags everywhere, but only strips dots on Gmail', () => {
    expect(normalizeEmail('first.last+recruiting@razorpay.com')).toBe('first.last@razorpay.com')
    // On most hosts a.b@ and ab@ are DIFFERENT mailboxes — collapsing them would
    // merge two people.
    expect(normalizeEmail('a.b@outlook.com')).not.toBe(normalizeEmail('ab@outlook.com'))
  })
  it('rejects anything that is not an address', () => {
    for (const v of ['', null, undefined, 'not-an-email', '@nope.com', 'x@', 'x@localhost']) {
      expect(normalizeEmail(v)).toBeNull()
    }
  })
})

describe('normalizeLinkedIn', () => {
  it('reduces every URL shape vendors emit to the bare slug', () => {
    for (const v of [
      'https://www.linkedin.com/in/asha-rao/?trk=public_profile',
      'http://linkedin.com/in/asha-rao',
      'in.linkedin.com/in/asha-rao/',
      'linkedin.com/in/asha-rao#section',
      'https://uk.linkedin.com/pub/asha-rao',
      'asha-rao',
    ]) {
      expect(normalizeLinkedIn(v)).toBe('asha-rao')
    }
  })
  it('refuses company and school pages', () => {
    // Minting an identity from these would merge everyone who worked somewhere
    // into a single person.
    expect(normalizeLinkedIn('https://linkedin.com/company/razorpay')).toBeNull()
    expect(normalizeLinkedIn('linkedin.com/school/bits-pilani')).toBeNull()
  })
  it('returns null rather than guessing', () => {
    expect(normalizeLinkedIn('https://example.com/asha')).toBeNull()
    expect(normalizeLinkedIn('')).toBeNull()
  })
})

describe('normalizeGithub', () => {
  it('reduces to the login', () => {
    expect(normalizeGithub('https://github.com/anshul-garg27')).toBe('anshul-garg27')
    expect(normalizeGithub('@Anshul-Garg27')).toBe('anshul-garg27')
    expect(normalizeGithub('github.com/anshul-garg27/')).toBe('anshul-garg27')
  })
  it('rejects non-profiles', () => {
    expect(normalizeGithub('https://example.com/x')).toBeNull()
    expect(normalizeGithub('')).toBeNull()
  })
})

describe('normalizePhone', () => {
  it('produces E.164 for the Indian shapes', () => {
    expect(normalizePhone('+91 98450 12345')).toBe('+919845012345')
    expect(normalizePhone('9845012345')).toBe('+919845012345')
    expect(normalizePhone('09845012345')).toBe('+919845012345')
    expect(normalizePhone('919845012345')).toBe('+919845012345')
    expect(normalizePhone('0091-98450-12345')).toBe('+919845012345')
  })
  it('returns null rather than inventing a country code', () => {
    // 8 national digits is not an Indian mobile; guessing would merge strangers.
    expect(normalizePhone('98450123')).toBeNull()
    expect(normalizePhone('123')).toBeNull()
    expect(normalizePhone('')).toBeNull()
  })
})

describe('normalizeIdentifiers', () => {
  it('drops what cannot be normalized and de-duplicates, keeping order', () => {
    const out = normalizeIdentifiers([
      { kind: 'email', value: 'Asha.Rao+jobs@Gmail.com' },
      { kind: 'email', value: 'asharao@gmail.com' }, // same mailbox
      { kind: 'linkedin', value: 'https://linkedin.com/company/razorpay' }, // not a person
      { kind: 'linkedin', value: 'in.linkedin.com/in/asha-rao' },
      { kind: 'phone', value: 'nonsense' },
    ])
    expect(out).toEqual([
      { kind: 'email', value: 'asharao@gmail.com' },
      { kind: 'linkedin', value: 'asha-rao' },
    ])
  })
})
