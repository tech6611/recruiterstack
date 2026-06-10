import { describe, it, expect } from 'vitest'
import { normalizePhone, digitsOnly } from '../phone'

describe('normalizePhone', () => {
  it('keeps E.164 input, stripping formatting', () => {
    expect(normalizePhone('+91 98765 43210')).toBe('+919876543210')
    expect(normalizePhone('+1 (415) 555-0132')).toBe('+14155550132')
    expect(normalizePhone('+44 7911 123456')).toBe('+447911123456')
  })

  it('treats a 00 prefix as international', () => {
    expect(normalizePhone('0091 9876543210')).toBe('+919876543210')
    expect(normalizePhone('0014155550132')).toBe('+14155550132')
  })

  it('applies the default country to national numbers', () => {
    expect(normalizePhone('98765 43210', 'IN')).toBe('+919876543210')
    expect(normalizePhone('(415) 555-0132', 'US')).toBe('+14155550132')
  })

  it('strips the trunk zero when applying a country code', () => {
    expect(normalizePhone('07911 123456', 'GB')).toBe('+447911123456')
  })

  it('does not double the country code when already present', () => {
    expect(normalizePhone('919876543210', 'IN')).toBe('+919876543210')
  })

  it('assumes bare digits are already E.164 when no country given', () => {
    expect(normalizePhone('919876543210')).toBe('+919876543210')
  })

  it('rejects garbage and out-of-range lengths', () => {
    expect(normalizePhone('')).toBeNull()
    expect(normalizePhone('n/a')).toBeNull()
    expect(normalizePhone('12345')).toBeNull()
    expect(normalizePhone('1234567890123456')).toBeNull()
  })

  it('ignores unknown default countries', () => {
    expect(normalizePhone('9876543210', 'ZZ')).toBe('+9876543210')
  })
})

describe('digitsOnly', () => {
  it('strips all non-digits', () => {
    expect(digitsOnly('+91 (98765) 432-10')).toBe('919876543210')
    expect(digitsOnly('abc')).toBe('')
  })
})
