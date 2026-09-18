import { describe, it, expect } from 'vitest'
import { filterReachableApprovers } from './reachability'

/** Minimal Supabase stub: org_members returns the active ids given, users the live ids given. */
function sb(active: string[], live: string[]) {
  const table = (rows: unknown[]) => {
    const q: Record<string, unknown> = {}
    for (const m of ['select', 'eq', 'in', 'is', 'not', 'filter', 'order', 'limit']) q[m] = () => q
    q.then = (res: (v: unknown) => unknown) => Promise.resolve({ data: rows, error: null }).then(res)
    return q
  }
  return { from: (t: string) => (t === 'org_members' ? table(active.map((user_id) => ({ user_id }))) : table(live.map((id) => ({ id })))) } as never
}

describe('filterReachableApprovers', () => {
  it('keeps only active members with a live login, preserving order', async () => {
    const r = await filterReachableApprovers(sb(['a', 'b'], ['a', 'b', 'c']), 'org', ['c', 'a', 'b', 'a'])
    expect(r).toEqual({ reachable: ['a', 'b'], dropped: ['c'] })
  })
  it('drops a member whose user row is deactivated (ghost login)', async () => {
    const r = await filterReachableApprovers(sb(['ghost'], []), 'org', ['ghost'])
    expect(r).toEqual({ reachable: [], dropped: ['ghost'] })
  })
  it('handles empty input without querying', async () => {
    expect(await filterReachableApprovers(sb([], []), 'org', [])).toEqual({ reachable: [], dropped: [] })
  })
})
