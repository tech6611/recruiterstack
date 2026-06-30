import { describe, it, expect, beforeEach } from 'vitest'
import { createMockSupabase } from '@/test/helpers'
import { listPendingApprovalsForUser, getApprovalDetail } from '../queries'

describe('approvals queries facade', () => {
  let mock: ReturnType<typeof createMockSupabase>
  beforeEach(() => { mock = createMockSupabase() })

  describe('listPendingApprovalsForUser', () => {
    it('returns an empty list when no steps await the user', async () => {
      mock.results.set('approval_steps', { data: [], error: null })
      const items = await listPendingApprovalsForUser(mock.client as never, 'org-1', 'user-1')
      expect(items).toEqual([])
    })

    it('throws when the step query errors', async () => {
      mock.results.set('approval_steps', { data: null, error: { message: 'boom' } })
      await expect(
        listPendingApprovalsForUser(mock.client as never, 'org-1', 'user-1'),
      ).rejects.toBeTruthy()
    })
  })

  describe('getApprovalDetail', () => {
    it('returns null when the approval is not in the org', async () => {
      mock.results.set('approvals', { data: null, error: null })
      const detail = await getApprovalDetail(mock.client as never, 'org-1', 'missing')
      expect(detail).toBeNull()
    })

    it('returns the approval with its steps', async () => {
      mock.results.set('approvals', { data: { id: 'ap-1', status: 'pending', target_type: 'opening' }, error: null })
      mock.results.set('approval_steps', { data: [{ id: 's1', step_index: 0, chain_step_id: 'cs1', approvers: [] }], error: null })
      const detail = await getApprovalDetail(mock.client as never, 'org-1', 'ap-1')
      expect(detail?.approval).toMatchObject({ id: 'ap-1' })
      expect(detail?.steps).toHaveLength(1)
    })
  })
})
