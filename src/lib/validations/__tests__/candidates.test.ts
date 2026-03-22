import { describe, it, expect } from 'vitest'
import { candidateInsertSchema, candidateUpdateSchema } from '../candidates'

describe('candidateInsertSchema', () => {
  it('accepts valid candidate data', () => {
    const result = candidateInsertSchema.safeParse({
      name: 'Jane Doe',
      email: 'Jane@Example.com',
      skills: ['TypeScript', 'React'],
      experience_years: 5,
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.email).toBe('jane@example.com') // lowercased
      expect(result.data.status).toBe('active') // default
      expect(result.data.phone).toBeNull() // default
    }
  })

  it('requires name', () => {
    const result = candidateInsertSchema.safeParse({
      email: 'test@example.com',
    })
    expect(result.success).toBe(false)
  })

  it('requires valid email', () => {
    const result = candidateInsertSchema.safeParse({
      name: 'Test',
      email: 'not-an-email',
    })
    expect(result.success).toBe(false)
  })

  it('rejects negative experience years', () => {
    const result = candidateInsertSchema.safeParse({
      name: 'Test',
      email: 'test@example.com',
      experience_years: -1,
    })
    expect(result.success).toBe(false)
  })

  it('validates status enum', () => {
    const result = candidateInsertSchema.safeParse({
      name: 'Test',
      email: 'test@example.com',
      status: 'invalid_status',
    })
    expect(result.success).toBe(false)
  })

  it('accepts all valid status values', () => {
    for (const status of ['active', 'inactive', 'interviewing', 'offer_extended', 'hired', 'rejected']) {
      const result = candidateInsertSchema.safeParse({
        name: 'Test',
        email: 'test@example.com',
        status,
      })
      expect(result.success).toBe(true)
    }
  })

  it('defaults skills to empty array', () => {
    const result = candidateInsertSchema.safeParse({
      name: 'Test',
      email: 'test@example.com',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.skills).toEqual([])
    }
  })
})

describe('candidateUpdateSchema', () => {
  it('accepts partial updates', () => {
    const result = candidateUpdateSchema.safeParse({
      name: 'Updated Name',
    })
    expect(result.success).toBe(true)
  })

  it('accepts empty object', () => {
    const result = candidateUpdateSchema.safeParse({})
    expect(result.success).toBe(true)
  })
})
