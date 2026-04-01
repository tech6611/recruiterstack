import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockSupabase, createMockRequest } from '@/test/helpers'
import { createAdminClient } from '@/lib/supabase/server'

import { PATCH } from '../[id]/route'

describe('/api/roles/[id]', () => {
  let mockSupabase: ReturnType<typeof createMockSupabase>

  beforeEach(() => {
    vi.clearAllMocks()
    mockSupabase = createMockSupabase()
    vi.mocked(createAdminClient).mockReturnValue(mockSupabase.client as never)
  })

  describe('PATCH', () => {
    it('updates role with valid fields', async () => {
      const role = { id: 'role-1', job_title: 'Staff Engineer', status: 'active' }
      mockSupabase.results.set('roles', { data: role, error: null })

      const req = createMockRequest('PATCH', '/api/roles/role-1', {
        job_title: 'Staff Engineer',
        salary_min: 100000,
        salary_max: 200000,
      })
      const res = await PATCH(req, { params: { id: 'role-1' } })
      const json = await res.json()

      expect(res.status).toBe(200)
      expect(json.data).toBeDefined()
    })

    it('rejects invalid status enum', async () => {
      const req = createMockRequest('PATCH', '/api/roles/role-1', {
        status: 'invalid',
      })
      const res = await PATCH(req, { params: { id: 'role-1' } })

      expect(res.status).toBe(400)
      expect((await res.json()).error).toBe('Validation failed')
    })

    it('accepts all valid status values', async () => {
      const validStatuses = ['draft', 'active', 'paused', 'closed']

      for (const status of validStatuses) {
        const role = { id: 'role-1', status }
        mockSupabase.results.set('roles', { data: role, error: null })

        const req = createMockRequest('PATCH', '/api/roles/role-1', { status })
        const res = await PATCH(req, { params: { id: 'role-1' } })

        expect(res.status).toBe(200)
      }
    })

    it('rejects negative salary values', async () => {
      const req = createMockRequest('PATCH', '/api/roles/role-1', {
        salary_min: -50000,
      })
      const res = await PATCH(req, { params: { id: 'role-1' } })

      expect(res.status).toBe(400)
    })

    it('rejects auto_advance_threshold > 100', async () => {
      const req = createMockRequest('PATCH', '/api/roles/role-1', {
        auto_advance_threshold: 150,
      })
      const res = await PATCH(req, { params: { id: 'role-1' } })

      expect(res.status).toBe(400)
    })

    it('rejects auto_reject_threshold < 0', async () => {
      const req = createMockRequest('PATCH', '/api/roles/role-1', {
        auto_reject_threshold: -10,
      })
      const res = await PATCH(req, { params: { id: 'role-1' } })

      expect(res.status).toBe(400)
    })

    it('accepts valid threshold values', async () => {
      const role = { id: 'role-1', auto_advance_threshold: 80, auto_reject_threshold: 20 }
      mockSupabase.results.set('roles', { data: role, error: null })

      const req = createMockRequest('PATCH', '/api/roles/role-1', {
        auto_advance_threshold: 80,
        auto_reject_threshold: 20,
      })
      const res = await PATCH(req, { params: { id: 'role-1' } })

      expect(res.status).toBe(200)
    })

    it('rejects non-integer min_experience', async () => {
      const req = createMockRequest('PATCH', '/api/roles/role-1', {
        min_experience: 3.5,
      })
      const res = await PATCH(req, { params: { id: 'role-1' } })

      expect(res.status).toBe(400)
    })
  })
})
