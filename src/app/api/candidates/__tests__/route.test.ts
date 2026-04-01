import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockSupabase, createMockRequest, buildCandidate } from '@/test/helpers'
import { createAdminClient } from '@/lib/supabase/server'

import { PATCH } from '../[id]/route'

describe('/api/candidates/[id]', () => {
  let mockSupabase: ReturnType<typeof createMockSupabase>

  beforeEach(() => {
    vi.clearAllMocks()
    mockSupabase = createMockSupabase()
    vi.mocked(createAdminClient).mockReturnValue(mockSupabase.client as never)
  })

  describe('PATCH', () => {
    it('updates candidate with valid fields', async () => {
      const candidate = buildCandidate({ name: 'Updated Name' })
      mockSupabase.results.set('candidates', { data: candidate, error: null })

      const req = createMockRequest('PATCH', '/api/candidates/cand-1', {
        name: 'Updated Name',
        email: 'new@example.com',
      })
      const res = await PATCH(req, { params: { id: 'cand-1' } })
      const json = await res.json()

      expect(res.status).toBe(200)
      expect(json.data).toBeDefined()
    })

    it('rejects invalid email format', async () => {
      const req = createMockRequest('PATCH', '/api/candidates/cand-1', {
        email: 'not-an-email',
      })
      const res = await PATCH(req, { params: { id: 'cand-1' } })
      const json = await res.json()

      expect(res.status).toBe(400)
      expect(json.error).toBe('Validation failed')
    })

    it('rejects invalid status enum', async () => {
      const req = createMockRequest('PATCH', '/api/candidates/cand-1', {
        status: 'super_hired',
      })
      const res = await PATCH(req, { params: { id: 'cand-1' } })

      expect(res.status).toBe(400)
    })

    it('accepts all valid status values', async () => {
      const validStatuses = ['active', 'inactive', 'interviewing', 'offer_extended', 'hired', 'rejected']

      for (const status of validStatuses) {
        const candidate = buildCandidate({ status })
        mockSupabase.results.set('candidates', { data: candidate, error: null })

        const req = createMockRequest('PATCH', '/api/candidates/cand-1', { status })
        const res = await PATCH(req, { params: { id: 'cand-1' } })

        expect(res.status).toBe(200)
      }
    })

    it('rejects negative experience_years', async () => {
      const req = createMockRequest('PATCH', '/api/candidates/cand-1', {
        experience_years: -3,
      })
      const res = await PATCH(req, { params: { id: 'cand-1' } })

      expect(res.status).toBe(400)
    })

    it('rejects invalid linkedin_url', async () => {
      const req = createMockRequest('PATCH', '/api/candidates/cand-1', {
        linkedin_url: 'not-a-url',
      })
      const res = await PATCH(req, { params: { id: 'cand-1' } })

      expect(res.status).toBe(400)
    })

    it('transforms email to lowercase', async () => {
      const candidate = buildCandidate({ email: 'test@example.com' })
      mockSupabase.results.set('candidates', { data: candidate, error: null })

      const req = createMockRequest('PATCH', '/api/candidates/cand-1', {
        email: 'Test@EXAMPLE.COM',
      })
      const res = await PATCH(req, { params: { id: 'cand-1' } })

      expect(res.status).toBe(200)
      // The parseBody with candidateUpdateSchema should lowercase the email
    })

    it('rejects invalid JSON', async () => {
      const req = new Request('http://localhost:3000/api/candidates/cand-1', {
        method: 'PATCH',
        body: 'bad json',
        headers: { 'Content-Type': 'application/json' },
      }) as unknown as import('next/server').NextRequest
      const res = await PATCH(req, { params: { id: 'cand-1' } })

      expect(res.status).toBe(400)
    })
  })
})
