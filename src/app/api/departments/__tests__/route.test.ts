import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockSupabase, createMockRequest } from '@/test/helpers'
import { createAdminClient } from '@/lib/supabase/server'

import { POST as CREATE_DEPT } from '../route'
import { POST as CREATE_LOC } from '../../locations/route'
import { POST as CREATE_BAND } from '../../compensation-bands/route'

function setupAdmin(mock: ReturnType<typeof createMockSupabase>) {
  // requireOrgAndUser → users lookup
  mock.results.set('users', { data: { id: 'user-1' }, error: null })
  // requireAdmin → org_members lookup
  mock.results.set('org_members', { data: { role: 'admin', is_active: true }, error: null })
}

describe('Workspace mutations', () => {
  let mock: ReturnType<typeof createMockSupabase>

  beforeEach(() => {
    vi.clearAllMocks()
    mock = createMockSupabase()
    vi.mocked(createAdminClient).mockReturnValue(mock.client as never)
    setupAdmin(mock)
  })

  describe('POST /api/departments', () => {
    it('creates a department for an admin', async () => {
      mock.results.set('departments', { data: { id: 'd1', name: 'Eng' }, error: null })
      const req = createMockRequest('POST', 'http://localhost:3000/api/departments', { name: 'Eng' })
      const res = await CREATE_DEPT(req)
      expect(res.status).toBe(201)
    })

    it('rejects non-admin', async () => {
      mock.results.set('org_members', { data: { role: 'recruiter', is_active: true }, error: null })
      const req = createMockRequest('POST', 'http://localhost:3000/api/departments', { name: 'Eng' })
      const res = await CREATE_DEPT(req)
      expect(res.status).toBe(403)
    })

    it('rejects empty name', async () => {
      const req = createMockRequest('POST', 'http://localhost:3000/api/departments', { name: '' })
      const res = await CREATE_DEPT(req)
      expect(res.status).toBe(400)
    })
  })

  describe('POST /api/locations', () => {
    it('creates a location with required fields only', async () => {
      mock.results.set('locations', { data: { id: 'l1', name: 'SF' }, error: null })
      const req = createMockRequest('POST', 'http://localhost:3000/api/locations', { name: 'SF' })
      const res = await CREATE_LOC(req)
      expect(res.status).toBe(201)
    })
  })

  describe('POST /api/compensation-bands', () => {
    it('creates a band with valid range', async () => {
      mock.results.set('compensation_bands', { data: { id: 'b1' }, error: null })
      const req = createMockRequest('POST', 'http://localhost:3000/api/compensation-bands', {
        name: 'IC4 SF', level: 'IC4', min_salary: 100000, max_salary: 150000, currency: 'USD',
      })
      const res = await CREATE_BAND(req)
      expect(res.status).toBe(201)
    })

    it('rejects min > max', async () => {
      const req = createMockRequest('POST', 'http://localhost:3000/api/compensation-bands', {
        name: 'Bad', level: 'IC4', min_salary: 200000, max_salary: 100000, currency: 'USD',
      })
      const res = await CREATE_BAND(req)
      expect(res.status).toBe(400)
    })
  })
})
