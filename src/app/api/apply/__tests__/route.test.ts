import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockSupabase, createMockRequest } from '@/test/helpers'
import { createAdminClient } from '@/lib/supabase/server'

vi.mock('@/lib/api/rate-limit', () => ({
  checkRateLimit: vi.fn(() => Promise.resolve(null)),
}))

vi.mock('@/lib/notifications', () => ({
  notify: vi.fn(() => Promise.resolve()),
}))

vi.mock('@/lib/ai/autopilot', () => ({
  runAutopilot: vi.fn(() => Promise.resolve()),
}))

vi.mock('@/lib/api/job-queue', () => ({
  enqueue: vi.fn(() => Promise.resolve()),
}))

import { GET, POST } from '../route'

describe('/api/apply', () => {
  let mockSupabase: ReturnType<typeof createMockSupabase>

  beforeEach(() => {
    vi.clearAllMocks()
    mockSupabase = createMockSupabase()
    vi.mocked(createAdminClient).mockReturnValue(mockSupabase.client as never)
  })

  describe('GET', () => {
    it('returns job data for valid token', async () => {
      const job = {
        position_title: 'Software Engineer',
        department: 'Engineering',
        location: 'Remote',
        generated_jd: 'Some JD',
        status: 'open',
      }
      mockSupabase.results.set('hiring_requests', { data: job, error: null })

      const req = createMockRequest('GET', 'http://localhost:3000/api/apply?token=valid-token')
      const res = await GET(req)
      const json = await res.json()

      expect(res.status).toBe(200)
      expect(json.data.position_title).toBe('Software Engineer')
    })

    it('returns 400 when token is missing', async () => {
      const req = createMockRequest('GET', 'http://localhost:3000/api/apply')
      const res = await GET(req)
      const json = await res.json()

      expect(res.status).toBe(400)
      expect(json.error).toBe('token required')
    })

    it('returns 404 for invalid token', async () => {
      mockSupabase.results.set('hiring_requests', { data: null, error: { code: 'PGRST116', message: 'Not found' } })

      const req = createMockRequest('GET', 'http://localhost:3000/api/apply?token=bad-token')
      const res = await GET(req)
      const json = await res.json()

      expect(res.status).toBe(404)
      expect(json.error).toBe('Not found')
    })
  })

  describe('POST', () => {
    it('returns 400 for missing required fields (no name)', async () => {
      const req = createMockRequest('POST', 'http://localhost:3000/api/apply', {
        token: 'valid-token',
        email: 'test@example.com',
      })
      const res = await POST(req)

      expect(res.status).toBe(400)
    })

    it('returns 400 for invalid email format', async () => {
      const req = createMockRequest('POST', 'http://localhost:3000/api/apply', {
        token: 'valid-token',
        name: 'Test User',
        email: 'not-an-email',
      })
      const res = await POST(req)

      expect(res.status).toBe(400)
    })

    it('returns 404 for invalid token', async () => {
      mockSupabase.results.set('hiring_requests', { data: null, error: { code: 'PGRST116', message: 'Not found' } })

      const req = createMockRequest('POST', 'http://localhost:3000/api/apply', {
        token: 'bad-token',
        name: 'Test User',
        email: 'test@example.com',
      })
      const res = await POST(req)
      const json = await res.json()

      expect(res.status).toBe(404)
      expect(json.error).toBe('Invalid or expired apply link')
    })

    it('returns 409 for duplicate application', async () => {
      mockSupabase.results.set('hiring_requests', {
        data: { id: 'job-1', org_id: 'org-1', position_title: 'Engineer', status: 'open', auto_advance_score: null, auto_reject_score: null },
        error: null,
      })
      mockSupabase.results.set('candidates', { data: { id: 'cand-1' }, error: null })
      mockSupabase.results.set('pipeline_stages', { data: { id: 'stage-1', name: 'Applied' }, error: null })
      mockSupabase.results.set('applications', { data: null, error: { code: '23505', message: 'duplicate key' } })

      const req = createMockRequest('POST', 'http://localhost:3000/api/apply', {
        token: 'valid-token',
        name: 'Test User',
        email: 'test@example.com',
      })
      const res = await POST(req)
      const json = await res.json()

      expect(res.status).toBe(409)
      expect(json.error).toBe('You have already applied for this role.')
    })

    it('creates application successfully with valid input', async () => {
      mockSupabase.results.set('hiring_requests', {
        data: { id: 'job-1', org_id: 'org-1', position_title: 'Engineer', status: 'open', auto_advance_score: null, auto_reject_score: null },
        error: null,
      })
      mockSupabase.results.set('candidates', { data: { id: 'cand-1' }, error: null })
      mockSupabase.results.set('pipeline_stages', { data: { id: 'stage-1', name: 'Applied' }, error: null })
      mockSupabase.results.set('applications', { data: { id: 'app-1' }, error: null })
      mockSupabase.results.set('application_events', { data: null, error: null })

      const req = createMockRequest('POST', 'http://localhost:3000/api/apply', {
        token: 'valid-token',
        name: 'Test User',
        email: 'test@example.com',
      })
      const res = await POST(req)
      const json = await res.json()

      expect(res.status).toBe(201)
      expect(json.data.application_id).toBe('app-1')
      expect(json.data.job_title).toBe('Engineer')
      expect(json.data.message).toBe('Application submitted successfully.')

      // Verify correct tables were queried
      expect(mockSupabase.client.from).toHaveBeenCalledWith('hiring_requests')
      expect(mockSupabase.client.from).toHaveBeenCalledWith('candidates')
      expect(mockSupabase.client.from).toHaveBeenCalledWith('pipeline_stages')
      expect(mockSupabase.client.from).toHaveBeenCalledWith('applications')
      expect(mockSupabase.client.from).toHaveBeenCalledWith('application_events')
    })
  })
})
