import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockSupabase, createMockRequest } from '@/test/helpers'
import { createAdminClient } from '@/lib/supabase/server'

// Mock notifications to avoid side effects
vi.mock('@/lib/notifications', () => ({
  notifySlack: vi.fn(() => Promise.resolve()),
  notifySlackDM: vi.fn(() => Promise.resolve()),
}))

import { PATCH } from '../[id]/route'

describe('/api/applications/[id]', () => {
  let mockSupabase: ReturnType<typeof createMockSupabase>

  const currentApp = {
    id: 'app-1',
    status: 'active',
    stage_id: 'stage-1',
    pipeline_stages: { name: 'Applied' },
    candidate: { name: 'Test Candidate' },
    hiring_request: { hiring_manager_email: 'hm@example.com', position_title: 'Engineer' },
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockSupabase = createMockSupabase()
    vi.mocked(createAdminClient).mockReturnValue(mockSupabase.client as never)
    // Default: application lookup succeeds
    mockSupabase.results.set('applications', { data: currentApp, error: null })
    mockSupabase.results.set('application_events', { data: null, error: null })
  })

  describe('PATCH — status change', () => {
    it('accepts valid status values', async () => {
      const validStatuses = ['active', 'rejected', 'withdrawn', 'hired']

      for (const status of validStatuses) {
        mockSupabase.results.set('applications', { data: { ...currentApp, status }, error: null })

        const req = createMockRequest('PATCH', '/api/applications/app-1', { status })
        const res = await PATCH(req, { params: { id: 'app-1' } })

        expect(res.status).toBe(200)
      }
    })

    it('rejects invalid status value', async () => {
      const req = createMockRequest('PATCH', '/api/applications/app-1', {
        status: 'super_rejected',
      })
      const res = await PATCH(req, { params: { id: 'app-1' } })
      const json = await res.json()

      expect(res.status).toBe(400)
      expect(json.error).toBe('Validation failed')
      expect(json.issues[0].path).toBe('status')
    })

    it('rejects empty string status', async () => {
      const req = createMockRequest('PATCH', '/api/applications/app-1', {
        status: '',
      })
      const res = await PATCH(req, { params: { id: 'app-1' } })

      expect(res.status).toBe(400)
    })

    it('rejects numeric status', async () => {
      const req = createMockRequest('PATCH', '/api/applications/app-1', {
        status: 42,
      })
      const res = await PATCH(req, { params: { id: 'app-1' } })

      expect(res.status).toBe(400)
    })
  })

  describe('PATCH — stage move', () => {
    it('accepts valid stage_id', async () => {
      mockSupabase.results.set('pipeline_stages', { data: { name: 'Interview' }, error: null })
      mockSupabase.results.set('applications', { data: { ...currentApp, stage_id: 'stage-2', candidate: { name: 'Test' } }, error: null })

      const req = createMockRequest('PATCH', '/api/applications/app-1', {
        stage_id: 'stage-2',
      })
      const res = await PATCH(req, { params: { id: 'app-1' } })

      expect(res.status).toBe(200)
    })

    it('accepts null stage_id (unstage)', async () => {
      mockSupabase.results.set('applications', { data: { ...currentApp, stage_id: null, candidate: { name: 'Test' } }, error: null })

      const req = createMockRequest('PATCH', '/api/applications/app-1', {
        stage_id: null,
      })
      const res = await PATCH(req, { params: { id: 'app-1' } })

      expect(res.status).toBe(200)
    })
  })

  describe('PATCH — add note', () => {
    it('accepts valid note', async () => {
      mockSupabase.results.set('application_events', { data: { id: 'evt-1' }, error: null })

      const req = createMockRequest('PATCH', '/api/applications/app-1', {
        note: 'Great candidate, moving forward.',
      })
      const res = await PATCH(req, { params: { id: 'app-1' } })

      expect(res.status).toBe(201)
    })

    it('rejects empty note', async () => {
      const req = createMockRequest('PATCH', '/api/applications/app-1', {
        note: '   ',
      })
      const res = await PATCH(req, { params: { id: 'app-1' } })

      expect(res.status).toBe(400)
      expect((await res.json()).error).toBe('note cannot be empty')
    })
  })

  describe('PATCH — empty body', () => {
    it('returns 400 when body has no recognized fields', async () => {
      const req = createMockRequest('PATCH', '/api/applications/app-1', {
        unknown_field: 'value',
      })
      const res = await PATCH(req, { params: { id: 'app-1' } })

      expect(res.status).toBe(400)
      expect((await res.json()).error).toBe('Nothing to update')
    })
  })
})
