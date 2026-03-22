import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { withOrg, parseBody, handleSupabaseError, sanitizeSearch } from '../helpers'

// Mock auth module
vi.mock('@/lib/auth', () => ({
  requireOrg: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createAdminClient: vi.fn(() => ({ from: vi.fn() })),
}))

import { requireOrg } from '@/lib/auth'

const mockRequireOrg = vi.mocked(requireOrg)

beforeEach(() => {
  vi.clearAllMocks()
})

describe('withOrg', () => {
  it('passes orgId and supabase to handler when authenticated', async () => {
    mockRequireOrg.mockResolvedValue({ orgId: 'org_123' })

    const handler = vi.fn().mockResolvedValue(
      NextResponse.json({ ok: true }),
    )

    const wrapped = withOrg(handler)
    const req = new NextRequest('http://localhost/api/test')
    await wrapped(req)

    expect(handler).toHaveBeenCalledTimes(1)
    expect(handler.mock.calls[0][1]).toBe('org_123') // orgId
    expect(handler.mock.calls[0][2]).toBeDefined() // supabase client
  })

  it('returns 401 when requireOrg fails', async () => {
    mockRequireOrg.mockResolvedValue(
      NextResponse.json({ error: 'No org' }, { status: 401 }),
    )

    const handler = vi.fn()
    const wrapped = withOrg(handler)
    const req = new NextRequest('http://localhost/api/test')
    const res = await wrapped(req)

    expect(handler).not.toHaveBeenCalled()
    expect(res.status).toBe(401)
  })

  it('catches unhandled errors and returns 500', async () => {
    mockRequireOrg.mockResolvedValue({ orgId: 'org_123' })

    const handler = vi.fn().mockRejectedValue(new Error('boom'))
    const wrapped = withOrg(handler)
    const req = new NextRequest('http://localhost/api/test')
    const res = await wrapped(req)

    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).toBe('Internal server error')
  })
})

describe('parseBody', () => {
  const schema = z.object({
    name: z.string().min(1),
    email: z.string().email(),
  })

  it('returns parsed data for valid input', async () => {
    const req = new NextRequest('http://localhost/api/test', {
      method: 'POST',
      body: JSON.stringify({ name: 'Test', email: 'test@example.com' }),
      headers: { 'Content-Type': 'application/json' },
    })

    const result = await parseBody(req, schema)
    expect(result).toEqual({ name: 'Test', email: 'test@example.com' })
  })

  it('returns 400 for invalid JSON', async () => {
    const req = new NextRequest('http://localhost/api/test', {
      method: 'POST',
      body: 'not json',
      headers: { 'Content-Type': 'application/json' },
    })

    const result = await parseBody(req, schema)
    expect(result).toBeInstanceOf(NextResponse)
    if (result instanceof NextResponse) {
      expect(result.status).toBe(400)
      const body = await result.json()
      expect(body.error).toBe('Invalid JSON body')
    }
  })

  it('returns 400 with validation issues for invalid data', async () => {
    const req = new NextRequest('http://localhost/api/test', {
      method: 'POST',
      body: JSON.stringify({ name: '', email: 'not-an-email' }),
      headers: { 'Content-Type': 'application/json' },
    })

    const result = await parseBody(req, schema)
    expect(result).toBeInstanceOf(NextResponse)
    if (result instanceof NextResponse) {
      expect(result.status).toBe(400)
      const body = await result.json()
      expect(body.error).toBe('Validation failed')
      expect(body.issues).toBeDefined()
      expect(body.issues.length).toBeGreaterThan(0)
    }
  })
})

describe('handleSupabaseError', () => {
  it('maps unique violation (23505) to 409', () => {
    const res = handleSupabaseError({ code: '23505', message: 'duplicate key' })
    expect(res.status).toBe(409)
  })

  it('maps PGRST116 to 404', () => {
    const res = handleSupabaseError({ code: 'PGRST116', message: 'not found' })
    expect(res.status).toBe(404)
  })

  it('maps PGRST205 to 503', () => {
    const res = handleSupabaseError({ code: 'PGRST205', message: 'table missing' })
    expect(res.status).toBe(503)
  })

  it('defaults to 500 for unknown errors', () => {
    const res = handleSupabaseError({ code: 'UNKNOWN', message: 'something broke' })
    expect(res.status).toBe(500)
  })
})

describe('sanitizeSearch', () => {
  it('escapes percent signs', () => {
    expect(sanitizeSearch('100%')).toBe('100\\%')
  })

  it('escapes underscores', () => {
    expect(sanitizeSearch('test_user')).toBe('test\\_user')
  })

  it('escapes commas (prevents filter injection)', () => {
    expect(sanitizeSearch('a,b')).toBe('a\\,b')
  })

  it('escapes parentheses', () => {
    expect(sanitizeSearch('func()')).toBe('func\\(\\)')
  })

  it('escapes periods', () => {
    expect(sanitizeSearch('file.txt')).toBe('file\\.txt')
  })

  it('escapes backslashes', () => {
    expect(sanitizeSearch('a\\b')).toBe('a\\\\b')
  })

  it('passes through normal text unchanged', () => {
    expect(sanitizeSearch('John Smith')).toBe('John Smith')
    expect(sanitizeSearch('engineer')).toBe('engineer')
  })

  it('handles empty string', () => {
    expect(sanitizeSearch('')).toBe('')
  })

  it('handles complex injection attempt', () => {
    const attack = 'x%,id.eq.secret_id)'
    const sanitized = sanitizeSearch(attack)
    // All special chars are escaped with backslashes
    expect(sanitized).toBe('x\\%\\,id\\.eq\\.secret\\_id\\)')
  })
})
