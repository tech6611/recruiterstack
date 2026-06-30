import { describe, it, expect, beforeEach } from 'vitest'
import { createMockSupabase } from '@/test/helpers'
import {
  addCandidateTag,
  createCandidateTask,
  listCandidateTags,
  AnnotationError,
} from '../candidate-annotations'

describe('candidate-annotations facade', () => {
  let mock: ReturnType<typeof createMockSupabase>
  beforeEach(() => { mock = createMockSupabase() })

  describe('addCandidateTag', () => {
    it('rejects an empty tag (400)', async () => {
      const err = await addCandidateTag(mock.client as never, 'org-1', 'c-1', '  ').catch((e: unknown) => e)
      expect(err).toBeInstanceOf(AnnotationError)
      expect((err as AnnotationError).status).toBe(400)
    })

    it('maps a unique-violation to 409', async () => {
      mock.results.set('candidate_tags', { data: null, error: { code: '23505', message: 'dup' } })
      const err = await addCandidateTag(mock.client as never, 'org-1', 'c-1', 'referral').catch((e: unknown) => e)
      expect(err).toBeInstanceOf(AnnotationError)
      expect((err as AnnotationError).status).toBe(409)
    })

    it('lower-cases and returns the inserted tag', async () => {
      mock.results.set('candidate_tags', { data: { id: 't1', tag: 'referral' }, error: null })
      const row = await addCandidateTag(mock.client as never, 'org-1', 'c-1', 'Referral')
      expect(row).toMatchObject({ tag: 'referral' })
    })
  })

  describe('createCandidateTask', () => {
    it('rejects a missing title (400)', async () => {
      const err = await createCandidateTask(mock.client as never, 'org-1', 'c-1', { title: '  ' }).catch((e: unknown) => e)
      expect(err).toBeInstanceOf(AnnotationError)
      expect((err as AnnotationError).status).toBe(400)
    })

    it('creates a task', async () => {
      mock.results.set('candidate_tasks', { data: { id: 'k1', title: 'Call back' }, error: null })
      const row = await createCandidateTask(mock.client as never, 'org-1', 'c-1', { title: 'Call back' })
      expect(row).toMatchObject({ title: 'Call back' })
    })
  })

  describe('listCandidateTags', () => {
    it('returns the rows', async () => {
      mock.results.set('candidate_tags', { data: [{ tag: 'a' }, { tag: 'b' }], error: null })
      const rows = await listCandidateTags(mock.client as never, 'org-1', 'c-1')
      expect(rows).toHaveLength(2)
    })
  })
})
