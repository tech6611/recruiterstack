import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockSupabase, createMockRequest } from '@/test/helpers'
import { createAdminClient } from '@/lib/supabase/server'

import { PATCH } from '../[id]/route'

describe('/api/email-templates/[id]', () => {
  let mockSupabase: ReturnType<typeof createMockSupabase>

  beforeEach(() => {
    vi.clearAllMocks()
    mockSupabase = createMockSupabase()
    vi.mocked(createAdminClient).mockReturnValue(mockSupabase.client as never)
  })

  describe('PATCH', () => {
    it('updates template with valid fields', async () => {
      const template = { id: 'tmpl-1', name: 'Updated', subject: 'New Subject', body: 'Content' }
      mockSupabase.results.set('email_templates', { data: template, error: null })

      const req = createMockRequest('PATCH', '/api/email-templates/tmpl-1', {
        name: 'Updated',
        subject: 'New Subject',
      })
      const res = await PATCH(req, { params: { id: 'tmpl-1' } })
      const json = await res.json()

      expect(res.status).toBe(200)
      expect(json.data).toBeDefined()
    })

    it('rejects empty name', async () => {
      const req = createMockRequest('PATCH', '/api/email-templates/tmpl-1', {
        name: '',
      })
      const res = await PATCH(req, { params: { id: 'tmpl-1' } })

      expect(res.status).toBe(400)
    })

    it('rejects name exceeding 200 chars', async () => {
      const req = createMockRequest('PATCH', '/api/email-templates/tmpl-1', {
        name: 'x'.repeat(201),
      })
      const res = await PATCH(req, { params: { id: 'tmpl-1' } })

      expect(res.status).toBe(400)
    })

    it('rejects subject exceeding 500 chars', async () => {
      const req = createMockRequest('PATCH', '/api/email-templates/tmpl-1', {
        subject: 'x'.repeat(501),
      })
      const res = await PATCH(req, { params: { id: 'tmpl-1' } })

      expect(res.status).toBe(400)
    })

    it('rejects body exceeding 50000 chars', async () => {
      const req = createMockRequest('PATCH', '/api/email-templates/tmpl-1', {
        body: 'x'.repeat(50001),
      })
      const res = await PATCH(req, { params: { id: 'tmpl-1' } })

      expect(res.status).toBe(400)
    })

    it('returns 400 when all fields are empty after trim', async () => {
      const req = createMockRequest('PATCH', '/api/email-templates/tmpl-1', {})
      const res = await PATCH(req, { params: { id: 'tmpl-1' } })

      expect(res.status).toBe(400)
    })
  })
})
