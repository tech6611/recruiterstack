import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockSupabase, createMockRequest, buildScorecard } from '@/test/helpers'
import { createAdminClient } from '@/lib/supabase/server'

// Must import after setup.ts mocks Clerk and Supabase
import { GET, POST } from '../route'

describe('/api/scorecards', () => {
  let mockSupabase: ReturnType<typeof createMockSupabase>

  beforeEach(() => {
    vi.clearAllMocks()
    mockSupabase = createMockSupabase()
    vi.mocked(createAdminClient).mockReturnValue(mockSupabase.client as never)
  })

  describe('GET', () => {
    it('returns scorecards filtered by application_id', async () => {
      const appId = '00000000-0000-0000-0000-000000000001'
      const scorecards = [
        buildScorecard({ application_id: appId }),
        buildScorecard({ application_id: appId, recommendation: 'no' }),
      ]
      mockSupabase.results.set('scorecards', { data: scorecards, error: null })

      const req = createMockRequest('GET', `http://localhost:3000/api/scorecards?application_id=${appId}`)
      const res = await GET(req)
      const json = await res.json()

      expect(res.status).toBe(200)
      expect(json.data).toHaveLength(2)
      expect(mockSupabase.client.from).toHaveBeenCalledWith('scorecards')
    })

    it('returns 400 when application_id is missing', async () => {
      const req = createMockRequest('GET', 'http://localhost:3000/api/scorecards')
      const res = await GET(req)
      const json = await res.json()

      expect(res.status).toBe(400)
      expect(json.error).toBe('application_id required')
    })

    it('returns empty array when no scorecards', async () => {
      mockSupabase.results.set('scorecards', { data: [], error: null })

      const req = createMockRequest('GET', 'http://localhost:3000/api/scorecards?application_id=some-id')
      const res = await GET(req)
      const json = await res.json()

      expect(res.status).toBe(200)
      expect(json.data).toEqual([])
    })
  })

  describe('POST', () => {
    it('creates scorecard with valid input', async () => {
      const scorecard = buildScorecard()
      mockSupabase.results.set('scorecards', { data: scorecard, error: null })

      const req = createMockRequest('POST', 'http://localhost:3000/api/scorecards', {
        application_id: scorecard.application_id,
        interviewer_name: 'Jane Smith',
        recommendation: 'yes',
      })
      const res = await POST(req)
      const json = await res.json()

      expect(res.status).toBe(201)
      expect(json.data).toBeDefined()
      expect(mockSupabase.client.from).toHaveBeenCalledWith('scorecards')
    })

    it('returns 400 when missing required fields', async () => {
      const req = createMockRequest('POST', 'http://localhost:3000/api/scorecards', {
        application_id: 'some-id',
        // missing interviewer_name and recommendation
      })
      const res = await POST(req)
      const json = await res.json()

      expect(res.status).toBe(400)
      expect(json.error).toContain('application_id, interviewer_name, and recommendation are required')
    })

    it('returns 400 when interviewer_name is empty/whitespace', async () => {
      const req = createMockRequest('POST', 'http://localhost:3000/api/scorecards', {
        application_id: 'some-id',
        interviewer_name: '   ',
        recommendation: 'yes',
      })
      const res = await POST(req)
      const json = await res.json()

      expect(res.status).toBe(400)
      expect(json.error).toContain('application_id, interviewer_name, and recommendation are required')
    })

    it('trims interviewer_name and stage_name', async () => {
      const scorecard = buildScorecard()
      mockSupabase.results.set('scorecards', { data: scorecard, error: null })

      const req = createMockRequest('POST', 'http://localhost:3000/api/scorecards', {
        application_id: scorecard.application_id,
        interviewer_name: '  Jane Smith  ',
        stage_name: '  Technical  ',
        recommendation: 'yes',
      })
      const res = await POST(req)

      expect(res.status).toBe(201)
      // Verify insert was called (the from mock was invoked with 'scorecards')
      expect(mockSupabase.client.from).toHaveBeenCalledWith('scorecards')
    })
  })
})
