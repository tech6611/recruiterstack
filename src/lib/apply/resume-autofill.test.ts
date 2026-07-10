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

  it('does not mistake an education year range for a phone number', () => {
    expect(extractContacts('B.Tech, CGPA 8.96 (2014-2018)').phone).toBeNull()
  })

  it('prefers an international +-prefixed number over a bare digit run', () => {
    const c = extractContacts('emp id 4455667788 · mobile +91 9140523655')
    expect(c.phone?.replace(/\D/g, '')).toBe('919140523655')
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

  // Regression: a PDF whose contact header was extracted garbled (characters
  // spaced apart, "@" split off) — the AI vision read is clean, so its values
  // must survive grounding, and the GPA/year line must not become the phone.
  it('recovers contact fields when the extracted text is garbled', () => {
    const GARBLED = `
Wareesha Nazeer
B.Tech (Computer Science and Engineering)
Contact No : + 9 1  9 1 4 0 5 2 3 6 5 5
E-mail : wareesha . sn @ gmail . com
Bengaluru
Education CGPA 8.96 (2014-2018)
`
    const raw = {
      name: 'Wareesha Nazeer',
      email: 'wareesha.sn@gmail.com',
      phone: '+91 9140523655',
    }
    const { candidate, meta } = buildAutofill(raw, GARBLED)
    expect(candidate.email).toBe('wareesha.sn@gmail.com')
    expect(candidate.phone?.replace(/\D/g, '')).toBe('919140523655')
    expect(candidate.name).toBe('Wareesha Nazeer')
    expect(meta.dropped).toEqual([])
  })

  it('still drops a hallucinated email whose text is not in the resume', () => {
    const { candidate, meta } = buildAutofill(
      { email: 'invented.person@nowhere.com' },
      'Some resume text with no email address in it at all.',
    )
    expect(candidate.email).toBeNull()
    expect(meta.dropped).toContain('email')
  })

  it('still drops a hallucinated phone whose digits are not in the resume', () => {
    const { candidate, meta } = buildAutofill(
      { phone: '+1 555 000 1234' },
      'Resume text mentioning no phone number whatsoever.',
    )
    expect(candidate.phone).toBeNull()
    expect(meta.dropped).toContain('phone')
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
