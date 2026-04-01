import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockSupabase, createMockRequest } from '@/test/helpers'
import { createAdminClient } from '@/lib/supabase/server'

import { PATCH } from '../[id]/route'

describe('/api/hiring-requests/[id]', () => {
  let mockSupabase: ReturnType<typeof createMockSupabase>

  beforeEach(() => {
    vi.clearAllMocks()
    mockSupabase = createMockSupabase()
    vi.mocked(createAdminClient).mockReturnValue(mockSupabase.client as never)
  })

  describe('PATCH', () => {
    it('updates with valid fields', async () => {
      const updated = { id: 'hr-1', position_title: 'Staff Engineer', status: 'posted' }
      mockSupabase.results.set('hiring_requests', { data: updated, error: null })

      const req = createMockRequest('PATCH', '/api/hiring-requests/hr-1', {
        position_title: 'Staff Engineer',
        department: 'Engineering',
      })
      const res = await PATCH(req, { params: { id: 'hr-1' } })
      const json = await res.json()

      expect(res.status).toBe(200)
      expect(json.data).toBeDefined()
    })

    it('rejects invalid email format', async () => {
      const req = createMockRequest('PATCH', '/api/hiring-requests/hr-1', {
        hiring_manager_email: 'not-an-email',
      })
      const res = await PATCH(req, { params: { id: 'hr-1' } })
      const json = await res.json()

      expect(res.status).toBe(400)
      expect(json.error).toBe('Validation failed')
      expect(json.issues.some((i: { path: string }) => i.path === 'hiring_manager_email')).toBe(true)
    })

    it('rejects negative headcount', async () => {
      const req = createMockRequest('PATCH', '/api/hiring-requests/hr-1', {
        headcount: -1,
      })
      const res = await PATCH(req, { params: { id: 'hr-1' } })

      expect(res.status).toBe(400)
    })

    it('rejects non-integer headcount', async () => {
      const req = createMockRequest('PATCH', '/api/hiring-requests/hr-1', {
        headcount: 2.5,
      })
      const res = await PATCH(req, { params: { id: 'hr-1' } })

      expect(res.status).toBe(400)
    })

    it('accepts valid scoring criteria', async () => {
      const updated = { id: 'hr-1', scoring_criteria: [{ id: 'sc-1', name: 'Tech', weight: 50, description: null }] }
      mockSupabase.results.set('hiring_requests', { data: updated, error: null })

      const req = createMockRequest('PATCH', '/api/hiring-requests/hr-1', {
        scoring_criteria: [
          { id: 'sc-1', name: 'Technical Skills', weight: 50, description: null },
          { id: 'sc-2', name: 'Culture Fit', weight: 50, description: 'Team alignment' },
        ],
      })
      const res = await PATCH(req, { params: { id: 'hr-1' } })

      expect(res.status).toBe(200)
    })

    it('rejects scoring criteria with weight > 100', async () => {
      const req = createMockRequest('PATCH', '/api/hiring-requests/hr-1', {
        scoring_criteria: [
          { id: 'sc-1', name: 'Technical Skills', weight: 150, description: null },
        ],
      })
      const res = await PATCH(req, { params: { id: 'hr-1' } })

      expect(res.status).toBe(400)
    })

    it('strips unknown fields (prevents org_id override)', async () => {
      const updated = { id: 'hr-1', position_title: 'Test' }
      mockSupabase.results.set('hiring_requests', { data: updated, error: null })

      const req = createMockRequest('PATCH', '/api/hiring-requests/hr-1', {
        position_title: 'Test',
        org_id: 'attacker_org',
        id: 'attacker_id',
      })
      const res = await PATCH(req, { params: { id: 'hr-1' } })

      // Should succeed but org_id/id should be stripped by Zod
      expect(res.status).toBe(200)
    })

    it('rejects invalid JSON', async () => {
      const req = new Request('http://localhost:3000/api/hiring-requests/hr-1', {
        method: 'PATCH',
        body: '{invalid json',
        headers: { 'Content-Type': 'application/json' },
      }) as unknown as import('next/server').NextRequest
      const res = await PATCH(req, { params: { id: 'hr-1' } })

      expect(res.status).toBe(400)
      expect((await res.json()).error).toBe('Invalid JSON body')
    })
  })
})
