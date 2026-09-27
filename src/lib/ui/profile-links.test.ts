import { describe, it, expect } from 'vitest'
import { classifyContact, profileLinks } from './profile-links'

describe('classifyContact', () => {
  it('reads the host, not the stored kind', () => {
    // The kind is written by whoever imported the row and is wrong often enough that
    // trusting it puts a LinkedIn mark on a GitHub profile.
    expect(classifyContact('website', 'https://github.com/mukeshsolanki')?.network).toBe('github')
    expect(classifyContact('linkedin', 'https://mukeshsolanki.com/')?.network).toBe('website')
  })

  it('accepts a bare domain', () => {
    expect(classifyContact('website', 'mukeshsolanki.com')).toEqual({
      network: 'website',
      label: 'mukeshsolanki.com',
      href: 'https://mukeshsolanki.com',
    })
  })

  it('treats twitter.com and x.com as the same network', () => {
    expect(classifyContact('website', 'https://twitter.com/a')?.network).toBe('x')
    expect(classifyContact('website', 'https://x.com/a')?.network).toBe('x')
  })

  it('does not let a path fake a host', () => {
    expect(classifyContact('website', 'https://example.com/github.com/x')?.network).toBe('website')
  })

  it('links email and phone without a URL', () => {
    expect(classifyContact('email', 'a@b.com')?.href).toBe('mailto:a@b.com')
    expect(classifyContact('phone', '+91 98765 43210')?.href).toBe('tel:+919876543210')
  })

  it('drops anything it cannot link to, rather than showing a dead globe', () => {
    expect(classifyContact('website', '')).toBeNull()
    expect(classifyContact('website', 'not a url at all')).toBeNull()
    expect(classifyContact('other', 'javascript:alert(1)')).toBeNull()
  })
})

describe('profileLinks', () => {
  it('is in a fixed order regardless of input order', () => {
    const a = profileLinks([{ kind: 'website', value: 'x.com/a' }, { kind: 'linkedin', value: 'linkedin.com/in/a' }])
    const b = profileLinks([{ kind: 'linkedin', value: 'linkedin.com/in/a' }, { kind: 'website', value: 'x.com/a' }])
    expect(a.map((l) => l.network)).toEqual(['linkedin', 'x'])
    expect(a).toEqual(b)
  })

  it('keeps one icon per network, first source winning', () => {
    const links = profileLinks([
      { kind: 'linkedin', value: 'https://linkedin.com/in/trusted' },
      { kind: 'linkedin', value: 'https://linkedin.com/in/other' },
    ])
    expect(links).toHaveLength(1)
    expect(links[0].href).toContain('trusted')
  })

  it('returns nothing for a locked profile', () => {
    expect(profileLinks([])).toEqual([])
    expect(profileLinks(null)).toEqual([])
  })
})
