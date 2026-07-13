import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Focused tests for the pending-user backfill in syncUserFromClerk.
 *
 * The critical behavior: when a hiring-manager seat was provisioned before the
 * person had a Clerk login (users.clerk_user_id IS NULL, matched by email —
 * migration 090), claiming their Clerk login must backfill clerk_user_id onto
 * that SAME row instead of inserting a duplicate. A duplicate would orphan the
 * historical approvals that reference the pending row's id.
 */

// createAdminClient is called inside syncUserFromClerk; we swap in a fake.
const fromMock = vi.fn()
vi.mock('@/lib/supabase/server', () => ({
  createAdminClient: () => ({ from: fromMock }),
}))

import { syncUserFromClerk, type ClerkUserPayload } from '../sync'

/**
 * A chainable query builder that records the operation + filters it saw and
 * resolves to a caller-supplied result. One builder per `.from()` call, so a
 * queue of results maps 1:1 to the sequence of table queries the code makes.
 */
function builderFor(result: { data: unknown; error: unknown }) {
  const calls: { op: string; args: unknown[] }[] = []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const b: any = {}
  for (const m of ['select', 'insert', 'update', 'upsert', 'eq', 'is', 'ilike']) {
    b[m] = (...args: unknown[]) => { calls.push({ op: m, args }); return b }
  }
  b.single = () => Promise.resolve(result)
  b.maybeSingle = () => Promise.resolve(result)
  b._calls = calls
  return b
}

const CLERK_USER: ClerkUserPayload = {
  id: 'clerk_abc',
  email_addresses: [{ id: 'e1', email_address: 'HM@example.com' }],
  primary_email_address_id: 'e1',
  first_name: 'Hazel',
  last_name: 'Manager',
  image_url: null,
}

describe('syncUserFromClerk — pending-user backfill', () => {
  beforeEach(() => {
    fromMock.mockReset()
  })

  it('claims a pending row (clerk_user_id IS NULL) by email and returns its id', async () => {
    const lookup = builderFor({ data: { id: 'pending-uuid' }, error: null })
    const update = builderFor({ data: null, error: null })
    fromMock.mockReturnValueOnce(lookup).mockReturnValueOnce(update)

    const id = await syncUserFromClerk(CLERK_USER)

    expect(id).toBe('pending-uuid')
    // First query filtered on a null clerk_user_id and the email.
    expect(lookup._calls.some((c: { op: string }) => c.op === 'is')).toBe(true)
    expect(lookup._calls.some((c: { op: string }) => c.op === 'ilike')).toBe(true)
    // Second query updated (not inserted/upserted) the pending row by id.
    expect(update._calls.some((c: { op: string }) => c.op === 'update')).toBe(true)
    expect(update._calls.some((c: { op: string; args: unknown[] }) => c.op === 'eq' && c.args[1] === 'pending-uuid')).toBe(true)
  })

  it('falls back to the upsert path when no pending row exists', async () => {
    const lookup = builderFor({ data: null, error: null })
    const upsert = builderFor({ data: { id: 'fresh-uuid' }, error: null })
    fromMock.mockReturnValueOnce(lookup).mockReturnValueOnce(upsert)

    const id = await syncUserFromClerk(CLERK_USER)

    expect(id).toBe('fresh-uuid')
    expect(upsert._calls.some((c: { op: string }) => c.op === 'upsert')).toBe(true)
  })
})
