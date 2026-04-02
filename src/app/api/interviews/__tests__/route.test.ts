import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockSupabase, createMockRequest, buildInterview } from '@/test/helpers'
import { createAdminClient } from '@/lib/supabase/server'

// Must import after setup.ts mocks Clerk and Supabase
import { GET as GET_ID, PATCH, DELETE } from '../[id]/route'

describe('/api/interviews/[id]', () => {
  let mockSupabase: ReturnType<typeof createMockSupabase>

  beforeEach(() => {
    vi.clearAllMocks()
    mockSupabase = createMockSupabase()
    vi.mocked(createAdminClient).mockReturnValue(mockSupabase.client as never)
  })

  describe('GET /api/interviews/[id]', () => {
    it('returns interview by id', async () => {
      const interview = buildInterview()
      mockSupabase.results.set('interviews', { data: interview, error: null })

      const req = createMockRequest('GET', `http://localhost:3000/api/interviews/${interview.id}`)
      const res = await GET_ID(req, { params: { id: interview.id } })
      const json = await res.json()

      expect(res.status).toBe(200)
      expect(json.data).toBeDefined()
      expect(json.data.id).toBe(interview.id)
      expect(mockSupabase.client.from).toHaveBeenCalledWith('interviews')
    })

    it('returns 404 for nonexistent id', async () => {
      mockSupabase.results.set('interviews', {
        data: null,
        error: { message: 'Row not found' },
      })

      const req = createMockRequest('GET', 'http://localhost:3000/api/interviews/nonexistent-id')
      const res = await GET_ID(req, { params: { id: 'nonexistent-id' } })
      const json = await res.json()

      expect(res.status).toBe(404)
      expect(json.error).toBe('Row not found')
    })
  })

  describe('PATCH /api/interviews/[id]', () => {
    it('updates interview fields', async () => {
      const interview = buildInterview({ notes: 'Updated notes' })
      mockSupabase.results.set('interviews', { data: interview, error: null })
      mockSupabase.results.set('application_events', { data: null, error: null })

      const req = createMockRequest('PATCH', `http://localhost:3000/api/interviews/${interview.id}`, {
        notes: 'Updated notes',
      })
      const res = await PATCH(req, { params: { id: interview.id } })
      const json = await res.json()

      expect(res.status).toBe(200)
      expect(json.data).toBeDefined()
      expect(mockSupabase.client.from).toHaveBeenCalledWith('interviews')
    })

    it('creates interview_completed event when status is completed', async () => {
      const interview = buildInterview({ status: 'completed' })
      mockSupabase.results.set('interviews', { data: interview, error: null })
      mockSupabase.results.set('application_events', { data: null, error: null })

      const req = createMockRequest('PATCH', `http://localhost:3000/api/interviews/${interview.id}`, {
        status: 'completed',
      })
      const res = await PATCH(req, { params: { id: interview.id } })

      expect(res.status).toBe(200)
      // Verify application_events table was accessed (insert for the event)
      const fromCalls = mockSupabase.client.from.mock.calls.map((c: unknown[]) => c[0])
      expect(fromCalls).toContain('application_events')
    })

    it('creates interview_cancelled event when status is cancelled', async () => {
      const interview = buildInterview({ status: 'cancelled' })
      mockSupabase.results.set('interviews', { data: interview, error: null })
      mockSupabase.results.set('application_events', { data: null, error: null })

      const req = createMockRequest('PATCH', `http://localhost:3000/api/interviews/${interview.id}`, {
        status: 'cancelled',
      })
      const res = await PATCH(req, { params: { id: interview.id } })

      expect(res.status).toBe(200)
      const fromCalls = mockSupabase.client.from.mock.calls.map((c: unknown[]) => c[0])
      expect(fromCalls).toContain('application_events')
    })

    it('does NOT create event for other status values', async () => {
      const interview = buildInterview({ status: 'rescheduled' })
      mockSupabase.results.set('interviews', { data: interview, error: null })

      const req = createMockRequest('PATCH', `http://localhost:3000/api/interviews/${interview.id}`, {
        status: 'rescheduled',
      })
      const res = await PATCH(req, { params: { id: interview.id } })

      expect(res.status).toBe(200)
      const fromCalls = mockSupabase.client.from.mock.calls.map((c: unknown[]) => c[0])
      expect(fromCalls).not.toContain('application_events')
    })
  })

  describe('DELETE /api/interviews/[id]', () => {
    it('returns success on delete', async () => {
      mockSupabase.results.set('interviews', { data: null, error: null })

      const req = createMockRequest('DELETE', 'http://localhost:3000/api/interviews/some-id')
      const res = await DELETE(req, { params: { id: 'some-id' } })
      const json = await res.json()

      expect(res.status).toBe(200)
      expect(json.success).toBe(true)
      expect(mockSupabase.client.from).toHaveBeenCalledWith('interviews')
    })
  })
})
