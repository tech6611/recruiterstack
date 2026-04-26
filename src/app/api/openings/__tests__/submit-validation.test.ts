import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockSupabase, createMockRequest } from '@/test/helpers'
import { createAdminClient } from '@/lib/supabase/server'

// Mock the engine — submit endpoint integration would otherwise need a full DB.
vi.mock('@/lib/approvals/engine', () => ({
  submitForApproval: vi.fn(async () => ({ approvalId: 'a-1', currentStepIndex: 0, status: 'pending', autoApproved: false })),
  ApprovalError: class extends Error { status = 400 },
}))

import { POST as SUBMIT } from '../[id]/submit/route'

describe('POST /api/openings/:id/submit', () => {
  let mock: ReturnType<typeof createMockSupabase>

  beforeEach(() => {
    vi.clearAllMocks()
    mock = createMockSupabase()
    vi.mocked(createAdminClient).mockReturnValue(mock.client as never)
    mock.results.set('users', { data: { id: 'user-1' }, error: null })
  })

  it('rejects when justification is too short', async () => {
    mock.results.set('openings', {
      data: { id: 'op-1', status: 'draft', justification: 'short', custom_fields: {} },
      error: null,
    })
    const req = createMockRequest('POST', 'http://localhost:3000/api/openings/op-1/submit')
    const res = await SUBMIT(req, { params: { id: 'op-1' } })
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toMatch(/50 characters/)
  })

  it('rejects when a required custom field is missing', async () => {
    // Long enough justification to pass the length gate.
    const longJustification = 'A'.repeat(60)
    mock.results.set('openings', {
      data: { id: 'op-1', status: 'draft', justification: longJustification, custom_fields: {} },
      error: null,
    })
    // Custom field defs query returns one required field.
    mock.results.set('custom_field_definitions', {
      data: [{ field_key: 'seniority', label: 'Seniority', field_type: 'text' }],
      error: null,
    })

    const req = createMockRequest('POST', 'http://localhost:3000/api/openings/op-1/submit')
    const res = await SUBMIT(req, { params: { id: 'op-1' } })
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toMatch(/Seniority/)
  })

  it('returns 409 when status is not draft', async () => {
    mock.results.set('openings', {
      data: { id: 'op-1', status: 'pending_approval', justification: 'A'.repeat(60), custom_fields: {} },
      error: null,
    })
    const req = createMockRequest('POST', 'http://localhost:3000/api/openings/op-1/submit')
    const res = await SUBMIT(req, { params: { id: 'op-1' } })
    expect(res.status).toBe(409)
  })
})
