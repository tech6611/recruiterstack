import { describe, it, expect, beforeEach } from 'vitest'
import { createMockSupabase } from '@/test/helpers'
import { openingCreateSchema } from '@/lib/validations/openings'
import {
  createOpening,
  submitOpeningForApproval,
  OpeningSubmitError,
} from '../openings'

// Direct unit tests for the canonical openings facade that both the
// /api/openings routes and the copilot opening tools call.
describe('openings facade', () => {
  let mock: ReturnType<typeof createMockSupabase>

  beforeEach(() => {
    mock = createMockSupabase()
  })

  describe('createOpening', () => {
    it('inserts and returns the draft row', async () => {
      mock.results.set('openings', {
        data: { id: 'op-1', title: 'Engineer', status: 'draft' },
        error: null,
      })
      const input = openingCreateSchema.parse({ title: 'Engineer' })
      const row = await createOpening(mock.client as never, 'org-1', 'user-1', input)
      expect(row.id).toBe('op-1')
      expect(row.status).toBe('draft')
    })

    it('throws when the insert errors', async () => {
      mock.results.set('openings', { data: null, error: { code: '500', message: 'boom' } })
      const input = openingCreateSchema.parse({ title: 'Engineer' })
      await expect(
        createOpening(mock.client as never, 'org-1', 'user-1', input),
      ).rejects.toBeTruthy()
    })
  })

  describe('submitOpeningForApproval', () => {
    it('rejects a non-draft opening with status 409', async () => {
      mock.results.set('openings', {
        data: { id: 'op-1', status: 'approved', justification: 'x'.repeat(60), custom_fields: {} },
        error: null,
      })
      const err = await submitOpeningForApproval(mock.client as never, 'org-1', 'user-1', 'op-1')
        .catch((e: unknown) => e)
      expect(err).toBeInstanceOf(OpeningSubmitError)
      expect((err as OpeningSubmitError).status).toBe(409)
    })

    it('rejects a too-short justification with status 400', async () => {
      mock.results.set('openings', {
        data: { id: 'op-1', status: 'draft', justification: 'too short', custom_fields: {} },
        error: null,
      })
      const err = await submitOpeningForApproval(mock.client as never, 'org-1', 'user-1', 'op-1')
        .catch((e: unknown) => e)
      expect(err).toBeInstanceOf(OpeningSubmitError)
      expect((err as OpeningSubmitError).status).toBe(400)
    })

    it('reports not found (404) when the opening is missing', async () => {
      mock.results.set('openings', { data: null, error: { code: 'PGRST116', message: 'no rows' } })
      const err = await submitOpeningForApproval(mock.client as never, 'org-1', 'user-1', 'missing')
        .catch((e: unknown) => e)
      expect(err).toBeInstanceOf(OpeningSubmitError)
      expect((err as OpeningSubmitError).status).toBe(404)
    })
  })
})
