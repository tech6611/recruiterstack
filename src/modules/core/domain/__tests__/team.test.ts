import { describe, it, expect, vi, beforeEach } from 'vitest'

// The facade calls out to the RBAC default-role assigner and (best-effort) Clerk
// invites. Stub both so the test stays focused on the provisioning decision +
// the org_members payload. CLERK_SECRET_KEY is left unset below, so the Clerk
// invitation is a no-op and no network call is made.
vi.mock('@/lib/rbac', () => ({ ensureDefaultMemberRole: vi.fn() }))
vi.mock('@/lib/clerk/invites', () => ({ revokePendingInvitations: vi.fn() }))

import { provisionHiringManagerSeat, getMemberByEmail } from '../team'
import { ensureDefaultMemberRole } from '@/lib/rbac'

type MockResult = { data: unknown; error: unknown }

/**
 * Chainable Supabase mock that (a) returns a *sequence* of results per table —
 * so the two `users` reads (lookup, then insert) can differ — and (b) records
 * every insert/upsert payload for assertions.
 */
function makeSupabase(seq: Record<string, MockResult[]>) {
  const cursors: Record<string, number> = {}
  const captured = { upserts: [] as Array<{ table: string; payload: unknown }>, inserts: [] as Array<{ table: string; payload: unknown }> }

  function nextResult(table: string): MockResult {
    const arr = seq[table] ?? [{ data: null, error: null }]
    const i = cursors[table] ?? 0
    cursors[table] = Math.min(i + 1, arr.length)
    return arr[Math.min(i, arr.length - 1)]
  }

  function builder(table: string) {
    const b: Record<string, unknown> = {}
    const chain = ['select', 'insert', 'update', 'delete', 'upsert', 'eq', 'ilike', 'in', 'is', 'order', 'limit', 'single', 'maybeSingle']
    for (const m of chain) {
      b[m] = vi.fn((payload?: unknown) => {
        if (m === 'upsert') captured.upserts.push({ table, payload })
        if (m === 'insert') captured.inserts.push({ table, payload })
        return b
      })
    }
    // Make the builder itself awaitable — chained methods return the raw builder,
    // so `then` must live here (not only on a Proxy) to resolve after a chain.
    b.then = (resolve: (v: MockResult) => void) => {
      const r = nextResult(table)
      resolve(r)
      return Promise.resolve(r)
    }
    return b
  }

  const client = { from: vi.fn((t: string) => builder(t)) }
  return { client, captured }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const asClient = (c: unknown) => c as any

describe('getMemberByEmail', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns the member when one exists in the org', async () => {
    const { client } = makeSupabase({
      org_members: [{ data: { role: 'recruiter', is_active: true, users: { id: 'u1', email: 'a@co.com', full_name: 'Ann' } }, error: null }],
    })
    const m = await getMemberByEmail(asClient(client), 'org1', 'A@Co.com')
    expect(m).toEqual({ userId: 'u1', email: 'a@co.com', fullName: 'Ann', role: 'recruiter', isActive: true })
  })

  it('returns null on empty email without querying', async () => {
    const { client } = makeSupabase({})
    expect(await getMemberByEmail(asClient(client), 'org1', '   ')).toBeNull()
    expect(client.from).not.toHaveBeenCalled()
  })
})

describe('provisionHiringManagerSeat', () => {
  beforeEach(() => vi.clearAllMocks())

  it('short-circuits for an existing member without touching users/rbac', async () => {
    const { client, captured } = makeSupabase({
      org_members: [{ data: { role: 'recruiter', is_active: true, users: { id: 'u1', email: 'a@co.com', full_name: 'Ann' } }, error: null }],
    })
    const res = await provisionHiringManagerSeat(asClient(client), {
      orgId: 'org1', email: 'a@co.com', name: 'Ann', invitedByUserId: 'inviter',
    })
    expect(res).toEqual({ userId: 'u1', created: false })
    expect(captured.inserts).toHaveLength(0)
    expect(captured.upserts).toHaveLength(0)
    expect(ensureDefaultMemberRole).not.toHaveBeenCalled()
  })

  it('inserts a pending user and a free hiring-manager seat for a brand-new email', async () => {
    const { client, captured } = makeSupabase({
      // getMemberByEmail → not a member; users lookup → none; users insert → new id.
      org_members: [{ data: null, error: null }, { data: null, error: null }],
      users: [{ data: null, error: null }, { data: { id: 'new-user' }, error: null }],
    })
    const res = await provisionHiringManagerSeat(asClient(client), {
      orgId: 'org1', email: 'New.HM@Co.com', name: '  Priya  ', invitedByUserId: 'inviter',
    })
    expect(res).toEqual({ userId: 'new-user', created: true })

    const userInsert = captured.inserts.find(i => i.table === 'users')?.payload as Record<string, unknown>
    expect(userInsert).toMatchObject({ clerk_user_id: null, email: 'new.hm@co.com', full_name: 'Priya', provisioned_via: 'approver_invite' })

    const seat = captured.upserts.find(u => u.table === 'org_members')?.payload as Record<string, unknown>
    expect(seat).toMatchObject({ org_id: 'org1', user_id: 'new-user', role: 'hiring_manager', is_active: true, is_free_seat: true })

    expect(ensureDefaultMemberRole).toHaveBeenCalledWith(expect.anything(), 'org1', 'new-user')
  })

  it('reuses an existing global users row instead of inserting a duplicate', async () => {
    const { client, captured } = makeSupabase({
      org_members: [{ data: null, error: null }, { data: null, error: null }],
      users: [{ data: { id: 'existing-global' }, error: null }],
    })
    const res = await provisionHiringManagerSeat(asClient(client), {
      orgId: 'org1', email: 'someone@co.com', name: null, invitedByUserId: 'inviter',
    })
    expect(res).toEqual({ userId: 'existing-global', created: true })
    expect(captured.inserts.filter(i => i.table === 'users')).toHaveLength(0)
    const seat = captured.upserts.find(u => u.table === 'org_members')?.payload as Record<string, unknown>
    expect(seat).toMatchObject({ user_id: 'existing-global', is_free_seat: true })
  })
})
