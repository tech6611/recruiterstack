import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createMockSupabase } from '@/test/helpers'

// Webhook emits are fire-and-forget; stub them so tests don't touch the network/DB.
vi.mock('@/lib/webhooks/emit', () => ({ emitWebhook: vi.fn(async () => {}) }))
// The approval engine is exercised by its own tests; stub for the submit path.
vi.mock('@/lib/approvals/engine', () => ({
  submitForApproval: vi.fn(async () => ({ approvalId: 'a-1', currentStepIndex: 0, status: 'pending', autoApproved: false })),
  ApprovalError: class extends Error { status = 400 },
}))

import {
  createJobFromApprovedOpening,
  submitJobForApproval,
  publishJob,
  pauseJob,
  resumeJob,
  withdrawJob,
} from '../job-lifecycle'

describe('job-lifecycle facade', () => {
  let mock: ReturnType<typeof createMockSupabase>
  beforeEach(() => { mock = createMockSupabase() })

  describe('createJobFromApprovedOpening', () => {
    it('refuses without a linked requisition (422)', async () => {
      const res = await createJobFromApprovedOpening(mock.client as never, 'org-1', 'user-1', {
        title: 'Eng', department: '', description: '', confidentiality: 'public',
        comp_min: null, comp_max: null, remote_ok: false, openings: [], intake: {},
        link_opening_id: null,
      } as never)
      expect(res).toMatchObject({ ok: false, code: 422 })
    })

    it('refuses when the linked requisition is not approved (422)', async () => {
      mock.results.set('openings', { data: { id: 'op-1', status: 'draft' }, error: null })
      const res = await createJobFromApprovedOpening(mock.client as never, 'org-1', 'user-1', {
        title: 'Eng', department: '', description: '', confidentiality: 'public',
        comp_min: null, comp_max: null, remote_ok: false, openings: [], intake: {},
        link_opening_id: 'op-1',
      } as never)
      expect(res).toMatchObject({ ok: false, code: 422 })
    })

    it('creates a draft job from an approved requisition', async () => {
      mock.results.set('openings', { data: { id: 'op-1', status: 'approved' }, error: null })
      mock.results.set('jobs', { data: { id: 'j1', title: 'Eng', status: 'draft' }, error: null })
      const res = await createJobFromApprovedOpening(mock.client as never, 'org-1', 'user-1', {
        title: 'Eng', department: '', description: '', confidentiality: 'public',
        comp_min: null, comp_max: null, remote_ok: false, openings: [], intake: {},
        link_opening_id: 'op-1',
      } as never)
      expect(res.ok).toBe(true)
    })
  })

  describe('submitJobForApproval', () => {
    it('rejects a non-draft job (409)', async () => {
      mock.results.set('jobs', { data: { id: 'j1', status: 'open' }, error: null })
      const res = await submitJobForApproval(mock.client as never, 'org-1', 'user-1', 'j1')
      expect(res).toMatchObject({ ok: false, code: 409 })
    })
    it('submits a draft job', async () => {
      mock.results.set('jobs', { data: { id: 'j1', status: 'draft' }, error: null })
      const res = await submitJobForApproval(mock.client as never, 'org-1', 'user-1', 'j1')
      expect(res.ok).toBe(true)
    })
  })

  describe('publishJob', () => {
    it('rejects when the job is not approved (409)', async () => {
      mock.results.set('jobs', { data: { id: 'j1', status: 'draft' }, error: null })
      const res = await publishJob(mock.client as never, 'org-1', 'j1')
      expect(res).toMatchObject({ ok: false, code: 409 })
    })
    it('rejects an approved job with no approved linked opening (409)', async () => {
      mock.results.set('jobs', { data: { id: 'j1', status: 'approved' }, error: null })
      mock.results.set('job_openings', { data: [], error: null })
      const res = await publishJob(mock.client as never, 'org-1', 'j1')
      expect(res).toMatchObject({ ok: false, code: 409 })
    })
    it('publishes an approved job with an approved opening', async () => {
      mock.results.set('jobs', { data: { id: 'j1', status: 'approved' }, error: null })
      mock.results.set('job_openings', { data: [{ opening_id: 'op-1' }], error: null })
      mock.results.set('openings', { data: [{ status: 'approved' }], error: null })
      const res = await publishJob(mock.client as never, 'org-1', 'j1')
      expect(res).toMatchObject({ ok: true, status: 'open' })
    })
  })

  describe('pause / resume / withdraw guards', () => {
    it('pause rejects a non-open job (409)', async () => {
      mock.results.set('jobs', { data: { id: 'j1', status: 'draft' }, error: null })
      expect(await pauseJob(mock.client as never, 'org-1', 'j1')).toMatchObject({ ok: false, code: 409 })
    })
    it('pause is idempotent when already paused', async () => {
      mock.results.set('jobs', { data: { id: 'j1', status: 'paused' }, error: null })
      expect(await pauseJob(mock.client as never, 'org-1', 'j1')).toMatchObject({ ok: true, status: 'paused' })
    })
    it('resume rejects a non-paused job (409)', async () => {
      mock.results.set('jobs', { data: { id: 'j1', status: 'draft' }, error: null })
      expect(await resumeJob(mock.client as never, 'org-1', 'j1')).toMatchObject({ ok: false, code: 409 })
    })
    it('withdraw rejects a draft job (409)', async () => {
      mock.results.set('jobs', { data: { id: 'j1', status: 'draft' }, error: null })
      expect(await withdrawJob(mock.client as never, 'org-1', 'j1')).toMatchObject({ ok: false, code: 409 })
    })
    it('withdraw retires an open job', async () => {
      mock.results.set('jobs', { data: { id: 'j1', status: 'open' }, error: null })
      expect(await withdrawJob(mock.client as never, 'org-1', 'j1')).toMatchObject({ ok: true, status: 'withdrawn' })
    })
  })
})
