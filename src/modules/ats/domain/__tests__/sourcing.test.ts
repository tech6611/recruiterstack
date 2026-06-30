import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createMockSupabase } from '@/test/helpers'

// Control candidate creation without a DB.
const findOrCreate = vi.fn(async () => ({ created: true }))
vi.mock('@/modules/ats/domain/candidates', () => ({
  findOrCreateCandidateProfile: (...args: unknown[]) => findOrCreate(...(args as [])),
}))

import { createCandidatesFromParsed, parseCandidatesCsv, SourcingError } from '../sourcing'

describe('sourcing facade', () => {
  let mock: ReturnType<typeof createMockSupabase>
  beforeEach(() => { mock = createMockSupabase(); findOrCreate.mockClear() })

  describe('createCandidatesFromParsed', () => {
    it('creates rows with an email and skips rows without one', async () => {
      findOrCreate.mockResolvedValueOnce({ created: true })
      const res = await createCandidatesFromParsed(mock.client as never, 'org-1', [
        { name: 'Has Email', email: 'a@b.com' },
        { name: 'No Email' },
      ])
      expect(res.created).toBe(1)
      expect(res.skipped).toBe(1)
      expect(findOrCreate).toHaveBeenCalledTimes(1)
    })

    it('counts an existing (not-created) profile as skipped', async () => {
      findOrCreate.mockResolvedValueOnce({ created: false })
      const res = await createCandidatesFromParsed(mock.client as never, 'org-1', [
        { name: 'Dup', email: 'dup@b.com' },
      ])
      expect(res.created).toBe(0)
      expect(res.skipped).toBe(1)
    })

    it('records an error string when creation throws', async () => {
      findOrCreate.mockRejectedValueOnce(new Error('db down'))
      const res = await createCandidatesFromParsed(mock.client as never, 'org-1', [
        { name: 'Boom', email: 'boom@b.com' },
      ])
      expect(res.errors).toHaveLength(1)
      expect(res.errors[0]).toContain('Boom')
    })
  })

  describe('parseCandidatesCsv', () => {
    it('rejects empty input with a 400 SourcingError', async () => {
      const err = await parseCandidatesCsv('').catch((e: unknown) => e)
      expect(err).toBeInstanceOf(SourcingError)
      expect((err as SourcingError).status).toBe(400)
    })
  })
})
