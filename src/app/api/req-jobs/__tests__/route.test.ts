import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockSupabase, createMockRequest } from '@/test/helpers'
import { createAdminClient } from '@/lib/supabase/server'

import { POST as CREATE } from '../route'
import { PATCH, DELETE } from '../[id]/route'
import { POST as PUBLISH } from '../[id]/publish/route'

describe('/api/req-jobs', () => {
  let mock: ReturnType<typeof createMockSupabase>

  beforeEach(() => {
    vi.clearAllMocks()
    mock = createMockSupabase()
    vi.mocked(createAdminClient).mockReturnValue(mock.client as never)
    mock.results.set('users', { data: { id: 'user-1' }, error: null })  // resolveUserIdFromClerk
  })

  it('creates a draft job', async () => {
    mock.results.set('jobs', { data: { id: 'j1', title: 'Eng', status: 'draft' }, error: null })
    const req = createMockRequest('POST', 'http://localhost:3000/api/req-jobs', { title: 'Eng' })
    const res = await CREATE(req)
    expect(res.status).toBe(201)
  })

  it('rejects empty title', async () => {
    const req = createMockRequest('POST', 'http://localhost:3000/api/req-jobs', {})
    const res = await CREATE(req)
    expect(res.status).toBe(400)
  })

  it('PATCH returns 409 when status is not draft', async () => {
    mock.results.set('jobs', { data: { id: 'j1', status: 'open' }, error: null })
    const req = createMockRequest('PATCH', 'http://localhost:3000/api/req-jobs/j1', { title: 'New' })
    const res = await PATCH(req, { params: { id: 'j1' } })
    expect(res.status).toBe(409)
  })

  it('DELETE soft-archives', async () => {
    mock.results.set('jobs', { data: { id: 'j1', status: 'archived' }, error: null })
    const req = createMockRequest('DELETE', 'http://localhost:3000/api/req-jobs/j1')
    const res = await DELETE(req, { params: { id: 'j1' } })
    expect(res.status).toBe(200)
  })

  describe('publish guard', () => {
    it('rejects publish when job not approved', async () => {
      mock.results.set('jobs', { data: { id: 'j1', status: 'draft' }, error: null })
      const req = createMockRequest('POST', 'http://localhost:3000/api/req-jobs/j1/publish')
      const res = await PUBLISH(req, { params: { id: 'j1' } })
      expect(res.status).toBe(409)
    })

    it('rejects publish when no openings linked', async () => {
      // Sequence of three queries with the same table — the mock returns the same
      // result for every .from('jobs') call, so we set it for the first query only
      // and let the no-link branch trip via empty job_openings.
      mock.results.set('jobs',         { data: { id: 'j1', status: 'approved' }, error: null })
      mock.results.set('job_openings', { data: [], error: null })
      const req = createMockRequest('POST', 'http://localhost:3000/api/req-jobs/j1/publish')
      const res = await PUBLISH(req, { params: { id: 'j1' } })
      expect(res.status).toBe(409)
    })
  })
})
