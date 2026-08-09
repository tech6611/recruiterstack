import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createMockSupabase, createMockRequest } from '@/test/helpers'
import { createAdminClient } from '@/lib/supabase/server'
import { GET } from '../route'

/**
 * Canonical-model guard for "Change Status" → "Move to stage".
 *
 * The dropdown loads a job's pipeline stages from this route. Canonical apps
 * key their stages by job_id; before the fix this route only accepted the
 * legacy hiring_request_id, so the stage list came up empty for canonical
 * candidates. These tests pin that job_id is a first-class parameter.
 */
describe('/api/pipeline-stages — canonical', () => {
  let mockSupabase: ReturnType<typeof createMockSupabase>

  beforeEach(() => {
    vi.clearAllMocks()
    mockSupabase = createMockSupabase()
    vi.mocked(createAdminClient).mockReturnValue(mockSupabase.client as never)
  })

  it('accepts a canonical job_id and returns its stages', async () => {
    mockSupabase.results.set('pipeline_stages', {
      data: [{ id: 's1', name: 'Applied', color: 'slate', order_index: 0 }],
      error: null,
    })

    const req = createMockRequest('GET', '/api/pipeline-stages?job_id=job-1')
    const res = await GET(req)
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.data).toHaveLength(1)
  })

  it('still accepts the legacy hiring_request_id', async () => {
    mockSupabase.results.set('pipeline_stages', { data: [], error: null })

    const req = createMockRequest('GET', '/api/pipeline-stages?hiring_request_id=hr-1')
    const res = await GET(req)

    expect(res.status).toBe(200)
  })

  it('returns 400 when neither job_id nor hiring_request_id is provided', async () => {
    const req = createMockRequest('GET', '/api/pipeline-stages')
    const res = await GET(req)

    expect(res.status).toBe(400)
  })
})
