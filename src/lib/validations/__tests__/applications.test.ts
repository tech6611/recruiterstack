import { describe, it, expect } from 'vitest'
import { applicationInsertSchema, publicApplySchema, applicationUpdateSchema } from '../applications'

describe('applicationInsertSchema', () => {
  it('accepts with candidate_id', () => {
    const result = applicationInsertSchema.safeParse({
      hiring_request_id: '550e8400-e29b-41d4-a716-446655440000',
      candidate_id: '550e8400-e29b-41d4-a716-446655440001',
    })
    expect(result.success).toBe(true)
  })

  it('accepts with candidate_data', () => {
    const result = applicationInsertSchema.safeParse({
      hiring_request_id: '550e8400-e29b-41d4-a716-446655440000',
      candidate_data: {
        name: 'Test User',
        email: 'test@example.com',
      },
    })
    expect(result.success).toBe(true)
  })

  it('rejects when neither candidate_id nor candidate_data', () => {
    const result = applicationInsertSchema.safeParse({
      hiring_request_id: '550e8400-e29b-41d4-a716-446655440000',
    })
    expect(result.success).toBe(false)
  })

  it('requires hiring_request_id', () => {
    const result = applicationInsertSchema.safeParse({
      candidate_id: '550e8400-e29b-41d4-a716-446655440001',
    })
    expect(result.success).toBe(false)
  })

  it('defaults source to manual', () => {
    const result = applicationInsertSchema.safeParse({
      hiring_request_id: '550e8400-e29b-41d4-a716-446655440000',
      candidate_id: '550e8400-e29b-41d4-a716-446655440001',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.source).toBe('manual')
    }
  })
})

describe('publicApplySchema', () => {
  it('accepts valid apply data', () => {
    const result = publicApplySchema.safeParse({
      token: 'abc123',
      name: 'Jane Doe',
      email: 'Jane@Example.com',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.email).toBe('jane@example.com')
    }
  })

  it('requires token, name, and email', () => {
    expect(publicApplySchema.safeParse({ name: 'Test', email: 'test@example.com' }).success).toBe(false)
    expect(publicApplySchema.safeParse({ token: 'abc', email: 'test@example.com' }).success).toBe(false)
    expect(publicApplySchema.safeParse({ token: 'abc', name: 'Test' }).success).toBe(false)
  })

  it('accepts optional fields', () => {
    const result = publicApplySchema.safeParse({
      token: 'abc123',
      name: 'Test',
      email: 'test@example.com',
      phone: '+1234567890',
      linkedin_url: 'https://linkedin.com/in/test',
      cover_letter: 'I am interested...',
      cv_url: 'https://example.com/cv.pdf',
    })
    expect(result.success).toBe(true)
  })
})

describe('applicationUpdateSchema', () => {
  it('accepts partial updates', () => {
    const result = applicationUpdateSchema.safeParse({ status: 'rejected' })
    expect(result.success).toBe(true)
  })

  it('validates status enum', () => {
    const result = applicationUpdateSchema.safeParse({ status: 'invalid' })
    expect(result.success).toBe(false)
  })
})
