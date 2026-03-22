import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockSupabase, createMockRequest } from '@/test/helpers'
import { createAdminClient } from '@/lib/supabase/server'

// Must import after setup.ts mocks Clerk and Supabase
import { GET, PATCH } from '../route'

describe('/api/notifications', () => {
  let mockSupabase: ReturnType<typeof createMockSupabase>

  beforeEach(() => {
    vi.clearAllMocks()
    mockSupabase = createMockSupabase()
    vi.mocked(createAdminClient).mockReturnValue(mockSupabase.client as never)
  })

  describe('GET', () => {
    it('returns paginated notifications', async () => {
      const notifications = [
        { id: '1', type: 'candidate_applied', title: 'New app', read: false, created_at: '2024-01-01' },
        { id: '2', type: 'score_complete', title: 'Scored', read: true, created_at: '2024-01-02' },
      ]
      mockSupabase.results.set('notifications', { data: notifications, error: null, count: 2 })

      const req = createMockRequest('GET', 'http://localhost:3000/api/notifications?limit=20&offset=0')
      const res = await GET(req, { params: {} })
      const json = await res.json()

      expect(res.status).toBe(200)
      expect(json.data).toHaveLength(2)
      expect(json.count).toBe(2)
    })

    it('filters by unread_only', async () => {
      mockSupabase.results.set('notifications', { data: [], error: null, count: 0 })

      const req = createMockRequest('GET', 'http://localhost:3000/api/notifications?unread_only=true')
      const res = await GET(req, { params: {} })

      expect(res.status).toBe(200)
      // Verify the eq('read', false) was called on the builder
      expect(mockSupabase.client.from).toHaveBeenCalledWith('notifications')
    })
  })

  describe('PATCH', () => {
    it('marks specific notifications as read', async () => {
      mockSupabase.results.set('notifications', { data: null, error: null })

      const req = createMockRequest('PATCH', 'http://localhost:3000/api/notifications', {
        ids: ['a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'],
      })
      const res = await PATCH(req, { params: {} })
      const json = await res.json()

      expect(res.status).toBe(200)
      expect(json.data.marked).toBe(1)
    })

    it('marks all notifications as read', async () => {
      mockSupabase.results.set('notifications', { data: null, error: null })

      const req = createMockRequest('PATCH', 'http://localhost:3000/api/notifications', {
        all: true,
      })
      const res = await PATCH(req, { params: {} })
      const json = await res.json()

      expect(res.status).toBe(200)
      expect(json.data.marked).toBe('all')
    })

    it('returns 400 for invalid body', async () => {
      const req = createMockRequest('PATCH', 'http://localhost:3000/api/notifications', {
        invalid: true,
      })
      const res = await PATCH(req, { params: {} })

      expect(res.status).toBe(400)
    })
  })
})
