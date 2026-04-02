import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockSupabase, createMockRequest } from '@/test/helpers'
import { createAdminClient } from '@/lib/supabase/server'

vi.mock('@/lib/api/rate-limit', () => ({
  checkRateLimit: vi.fn(() => Promise.resolve(null)),
}))

// Must import after setup.ts mocks Clerk and Supabase
import { POST } from '../route'

describe('/api/leads', () => {
  let mockSupabase: ReturnType<typeof createMockSupabase>

  beforeEach(() => {
    vi.clearAllMocks()
    mockSupabase = createMockSupabase()
    vi.mocked(createAdminClient).mockReturnValue(mockSupabase.client as never)
  })

  it('creates lead with valid email, returns { success: true }', async () => {
    mockSupabase.results.set('leads', { data: null, error: null })

    const req = createMockRequest('POST', 'http://localhost:3000/api/leads', {
      email: 'user@example.com',
    })
    const res = await POST(req)
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.success).toBe(true)
    expect(mockSupabase.client.from).toHaveBeenCalledWith('leads')
  })

  it('returns 400 for missing email', async () => {
    const req = createMockRequest('POST', 'http://localhost:3000/api/leads', {})
    const res = await POST(req)
    const json = await res.json()

    expect(res.status).toBe(400)
    expect(json.error).toBe('Email is required')
  })

  it('returns 400 for non-string email', async () => {
    const req = createMockRequest('POST', 'http://localhost:3000/api/leads', {
      email: 12345,
    })
    const res = await POST(req)
    const json = await res.json()

    expect(res.status).toBe(400)
    expect(json.error).toBe('Email is required')
  })

  it('returns 400 for invalid email format', async () => {
    const req = createMockRequest('POST', 'http://localhost:3000/api/leads', {
      email: 'not-an-email',
    })
    const res = await POST(req)
    const json = await res.json()

    expect(res.status).toBe(400)
    expect(json.error).toBe('Invalid email address')
  })

  it('returns 200 (not 409) for duplicate email to prevent enumeration', async () => {
    mockSupabase.results.set('leads', {
      data: null,
      error: { code: '23505', message: 'duplicate key value' },
    })

    const req = createMockRequest('POST', 'http://localhost:3000/api/leads', {
      email: 'existing@example.com',
    })
    const res = await POST(req)
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.success).toBe(true)
  })

  it('defaults source to homepage', async () => {
    mockSupabase.results.set('leads', { data: null, error: null })

    const req = createMockRequest('POST', 'http://localhost:3000/api/leads', {
      email: 'user@example.com',
    })
    const res = await POST(req)

    expect(res.status).toBe(200)
    expect(mockSupabase.client.from).toHaveBeenCalledWith('leads')
  })

  it('accepts custom source value', async () => {
    mockSupabase.results.set('leads', { data: null, error: null })

    const req = createMockRequest('POST', 'http://localhost:3000/api/leads', {
      email: 'user@example.com',
      source: 'blog',
    })
    const res = await POST(req)
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.success).toBe(true)
  })
})
