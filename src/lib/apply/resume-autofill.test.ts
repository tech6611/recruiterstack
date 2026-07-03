import { describe, it, expect } from 'vitest'
import { extractContacts, isGrounded, buildAutofill } from './resume-autofill'

const RESUME = `
Jane Smith
Senior Engineering Manager
Bengaluru, Karnataka, India
Email: jane.smith@example.com  ·  Phone: +91 98765 43210
LinkedIn: https://linkedin.com/in/janesmith

Skills: React, TypeScript, Node.js, PostgreSQL
`

describe('extractContacts', () => {
  it('pulls email, phone and linkedin from resume text', () => {
    const c = extractContacts(RESUME)
    expect(c.email).toBe('jane.smith@example.com')
    expect(c.linkedin_url).toBe('https://linkedin.com/in/janesmith')
    expect(c.phone?.replace(/\D/g, '')).toBe('919876543210')
  })

  it('adds a scheme to a bare linkedin url', () => {
    const c = extractContacts('profile at linkedin.com/in/foo-bar')
    expect(c.linkedin_url).toBe('https://linkedin.com/in/foo-bar')
  })

  it('returns nulls when nothing matches', () => {
    const c = extractContacts('no contact details here at all')
    expect(c).toEqual({ email: null, phone: null, linkedin_url: null })
  })

  it('ignores digit runs that are too short or too long to be phones', () => {
    expect(extractContacts('order 12345 placed in 2021').phone).toBeNull()
    expect(extractContacts('ref 1234567890123456789').phone).toBeNull()
  })
})

describe('isGrounded', () => {
  const norm = 'janesmithseniorengineeringmanagerbengaluru'
  it('accepts a value present verbatim', () => {
    expect(isGrounded('Jane Smith', norm)).toBe(true)
  })
  it('accepts a multi-word value whose tokens all appear (reordered/punctuated)', () => {
    expect(isGrounded('Smith, Jane', norm)).toBe(true)
  })
  it('rejects a value that is not in the text (a hallucination)', () => {
    expect(isGrounded('John Doe', norm)).toBe(false)
  })
})

describe('buildAutofill', () => {
  it('produces a fully grounded candidate from a clean resume', () => {
    const raw = {
      name: 'Jane Smith',
      email: 'jane.smith@example.com',
      phone: '+91 98765 43210',
      linkedin_url: 'https://linkedin.com/in/janesmith',
      current_title: 'Senior Engineering Manager',
      location: 'Bengaluru, Karnataka, India',
      experience_years: 9,
      skills: ['React', 'TypeScript', 'Node.js'],
    }
    const { candidate, meta } = buildAutofill(raw, RESUME)
    expect(candidate.name).toBe('Jane Smith')
    expect(candidate.email).toBe('jane.smith@example.com')
    expect(candidate.current_title).toBe('Senior Engineering Manager')
    expect(candidate.skills).toEqual(['React', 'TypeScript', 'Node.js'])
    expect(meta.dropped).toEqual([])
    expect(meta.grounded).toBe(true)
    expect(meta.filled).toContain('name')
  })

  it('drops a hallucinated name that is not in the resume text', () => {
    const { candidate, meta } = buildAutofill({ name: 'Imaginary Person' }, RESUME)
    expect(candidate.name).toBeNull()
    expect(meta.dropped).toContain('name')
  })

  it('drops a hallucinated skill but keeps the real ones', () => {
    const { candidate } = buildAutofill(
      { skills: ['React', 'COBOL', 'TypeScript'] },
      RESUME,
    )
    expect(candidate.skills).toEqual(['React', 'TypeScript'])
  })

  it('lets deterministic regex override a wrong AI email', () => {
    const { candidate } = buildAutofill(
      { email: 'wrong@hallucinated.com' },
      RESUME,
    )
    expect(candidate.email).toBe('jane.smith@example.com')
  })

  it('defers to AI output (no grounding) when resume text is empty', () => {
    const { candidate, meta } = buildAutofill(
      { name: 'Jane Smith', current_title: 'CTO' },
      '',
    )
    expect(candidate.name).toBe('Jane Smith')
    expect(candidate.current_title).toBe('CTO')
    expect(meta.grounded).toBe(false)
    expect(meta.dropped).toEqual([])
  })

  it('treats "null"/"n/a" strings as empty', () => {
    const { candidate } = buildAutofill(
      { name: 'null', current_title: 'N/A' },
      RESUME,
    )
    expect(candidate.name).toBeNull()
    expect(candidate.current_title).toBeNull()
  })
})
